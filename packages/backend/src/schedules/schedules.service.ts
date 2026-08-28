import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Prisma, Schedule, ScheduleStatus } from '@prisma/client';
import { SCHEDULE_STATUS } from '../common/constants/prisma-enums.constants';
import { PrismaService } from '../prisma/prisma.service';
import { AudienceResolverService } from '../contacts/audience-resolver.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { computeNextRunAt, pickRandomMessage } from './schedule-calculator';
import { MESSAGE_DISPATCH_QUEUE } from '../queue/queue.module';

@Injectable()
export class SchedulesService {
  private readonly logger = new Logger(SchedulesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceResolver: AudienceResolverService,
    @InjectQueue(MESSAGE_DISPATCH_QUEUE) private readonly dispatchQueue: Queue,
  ) {
    // BullMQ's Queue extends Node's EventEmitter and re-emits its
    // underlying ioredis connection's 'error' events on itself. An
    // EventEmitter that emits 'error' with zero listeners attached throws
    // that error as an uncaught exception (standard Node.js behavior, not
    // BullMQ-specific) — under light load a transient Redis blip is rare
    // enough this never surfaced, but under concurrent burst traffic it's
    // far more likely, and an uncaught exception here can destabilize the
    // shared connection for other in-flight commands, not just this one.
    this.dispatchQueue.on('error', (error) => this.logger.error(`MESSAGE_DISPATCH_QUEUE connection error: ${error.message}`, error.stack));
  }

  list(organizationId: string) {
    return this.prisma.schedule.findMany({
      where: { organizationId },
      include: { template: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const schedule = await this.prisma.schedule.findFirst({ where: { id, organizationId } });
    if (!schedule) throw new NotFoundException('Schedule not found');
    return schedule;
  }

  async create(organizationId: string, userId: string, dto: CreateScheduleDto) {
    const data: Prisma.ScheduleCreateInput = {
      organization: { connect: { id: organizationId } },
      createdBy: { connect: { id: userId } },
      name: dto.name,
      recurrenceType: dto.recurrenceType,
      cronExpression: dto.cronExpression,
      intervalHours: dto.intervalHours,
      intervalDays: dto.intervalDays,
      daysOfWeek: dto.daysOfWeek ?? [],
      timeOfDay: dto.timeOfDay,
      timezone: dto.timezone ?? 'UTC',
      randomTimeEnabled: dto.randomTimeEnabled ?? false,
      randomWindowStart: dto.randomWindowStart,
      randomWindowEnd: dto.randomWindowEnd,
      randomMinGapMinutes: dto.randomMinGapMinutes,
      randomMaxGapMinutes: dto.randomMaxGapMinutes,
      avoidSameTimeAsLast: dto.avoidSameTimeAsLast ?? true,
      messagePool: dto.messagePool ?? [],
      ...(dto.templateId ? { template: { connect: { id: dto.templateId } } } : {}),
      audienceType: dto.audienceType,
      audienceRef: dto.audienceRef as Prisma.InputJsonValue,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
    };

    const schedule = await this.prisma.schedule.create({ data });
    return this.recomputeNextRun(schedule);
  }

  async update(organizationId: string, id: string, dto: UpdateScheduleDto) {
    const existing = await this.findOne(organizationId, id);
    const updated = await this.prisma.schedule.update({
      where: { id: existing.id },
      data: {
        ...dto,
        audienceRef: dto.audienceRef as Prisma.InputJsonValue | undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      },
    });
    return this.recomputeNextRun(updated);
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);
    await this.prisma.schedule.delete({ where: { id } });
    return { success: true };
  }

  async setStatus(organizationId: string, id: string, status: ScheduleStatus) {
    const existing = await this.findOne(organizationId, id);
    const updated = await this.prisma.schedule.update({ where: { id: existing.id }, data: { status } });
    return status === SCHEDULE_STATUS.ACTIVE ? this.recomputeNextRun(updated) : updated;
  }

  async duplicate(organizationId: string, id: string) {
    const existing = await this.findOne(organizationId, id);
    const { id: _id, createdAt, updatedAt, lastRunAt, nextRunAt, messagePool, audienceRef, ...rest } = existing;
    const copy = await this.prisma.schedule.create({
      data: {
        ...rest,
        messagePool: messagePool as Prisma.InputJsonValue,
        audienceRef: audienceRef as Prisma.InputJsonValue,
        name: `${existing.name} (copy)`,
        status: SCHEDULE_STATUS.PAUSED,
      },
    });
    return copy;
  }

  /**
   * Manual override for calendar drag-and-drop: sets nextRunAt directly to
   * the dropped date/time. For recurring schedules this only affects the
   * upcoming occurrence — the recurrence rule resumes normally after that.
   */
  async rescheduleNextRun(organizationId: string, id: string, newDate: Date) {
    await this.findOne(organizationId, id);
    return this.prisma.schedule.update({ where: { id }, data: { nextRunAt: newDate } });
  }

  private async recomputeNextRun(schedule: Schedule) {
    const nextRunAt = computeNextRunAt(schedule);
    return this.prisma.schedule.update({
      where: { id: schedule.id },
      data: {
        nextRunAt,
        status: nextRunAt ? schedule.status : SCHEDULE_STATUS.EXPIRED,
      },
    });
  }

  /**
   * Called by the schedule-tick worker (every minute). Finds every ACTIVE
   * schedule whose nextRunAt has arrived, resolves its audience, enqueues
   * one message-dispatch job per contact (with a random message from the
   * pool if configured), then recomputes nextRunAt for the following run.
   */
  async runDueSchedules(now: Date = new Date()) {
    const due = await this.prisma.schedule.findMany({
      where: { status: SCHEDULE_STATUS.ACTIVE, nextRunAt: { lte: now } },
    });

    let dispatched = 0;

    for (const schedule of due) {
      const contactIds = await this.audienceResolver.resolve(
        schedule.organizationId,
        schedule.audienceType,
        schedule.audienceRef,
      );

      const messagePool = (schedule.messagePool as unknown as string[]) ?? [];
      const body = messagePool.length ? (pickRandomMessage(messagePool) as string) : undefined;

      for (const contactId of contactIds) {
        await this.dispatchQueue.add('dispatch', {
          organizationId: schedule.organizationId,
          contactId,
          scheduleId: schedule.id,
          templateId: schedule.templateId,
          body,
        });
        dispatched++;
      }

      const updated = await this.prisma.schedule.update({
        where: { id: schedule.id },
        data: { lastRunAt: now },
      });
      await this.recomputeNextRun(updated);

      this.logger.log(`Schedule "${schedule.name}" fired -> ${contactIds.length} recipient(s) queued`);
    }

    return { schedulesRun: due.length, messagesDispatched: dispatched };
  }

}
