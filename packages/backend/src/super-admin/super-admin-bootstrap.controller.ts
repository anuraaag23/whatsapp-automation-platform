import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Logger,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Public } from '../common/decorators/public.decorator';
import { BootstrapSuperAdminDto } from './dto/bootstrap.dto';

/**
 * Provides a secure, one-time bootstrap mechanism to designate the initial platform
 * Super Admin on free hosting tiers (e.g. Render Free) where direct container shell
 * access is not available.
 *
 * Security properties:
 * 1. Disabled by default: If SUPER_ADMIN_BOOTSTRAP_SECRET is not configured in the
 *    server environment, this endpoint returns 404 Not Found (behaves as non-existent).
 * 2. Timing-safe verification: Uses crypto.timingSafeEqual to prevent timing attacks.
 * 3. Fixed target email: Only the email matching SUPER_ADMIN_BOOTSTRAP_EMAIL
 *    (defaulting to anurag.ay8840@gmail.com) can be promoted; arbitrary self-promotion
 *    is strictly rejected with 403 Forbidden.
 * 4. Safe failure: If the target user does not exist in the database, it rejects
 *    with 404 and does NOT create any user or organization.
 * 5. Idempotent: If the target account is already a Super Admin, it returns a safe
 *    success response without modifying any records.
 * 6. Non-destructive: Does NOT touch passwords, roles, organization memberships, or
 *    other users. Only updates isSuperAdmin = true on the target user.
 * 7. Removable / lockable: Once the Super Admin is provisioned, removing
 *    SUPER_ADMIN_BOOTSTRAP_SECRET from the Render environment permanently closes
 *    the endpoint.
 */
@Controller('super-admin/bootstrap')
export class SuperAdminBootstrapController {
  private readonly logger = new Logger(SuperAdminBootstrapController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async bootstrap(
    @Body() dto: BootstrapSuperAdminDto,
    @Headers('x-bootstrap-secret') headerSecret?: string,
    @Ip() ip?: string,
  ) {
    const configuredSecret = this.config.get<string>('SUPER_ADMIN_BOOTSTRAP_SECRET');
    if (!configuredSecret || configuredSecret.trim().length === 0) {
      throw new NotFoundException('Super Admin bootstrap is disabled or not configured');
    }

    const providedSecret = (dto.secret || headerSecret || '').trim();
    if (!providedSecret) {
      throw new ForbiddenException('Missing bootstrap credentials');
    }

    // Timing-safe secret verification
    const providedBuf = Buffer.from(providedSecret, 'utf8');
    const expectedBuf = Buffer.from(configuredSecret.trim(), 'utf8');
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      throw new ForbiddenException('Invalid bootstrap credentials');
    }

    // Configured target email verification
    const configuredEmail = (
      this.config.get<string>('SUPER_ADMIN_BOOTSTRAP_EMAIL') || 'anurag.ay8840@gmail.com'
    )
      .trim()
      .toLowerCase();

    const requestedEmail = (dto.email || '').trim().toLowerCase();
    if (requestedEmail !== configuredEmail) {
      throw new ForbiddenException(
        `Bootstrap is strictly restricted to the configured administrator email: ${configuredEmail}`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email: configuredEmail },
      select: {
        id: true,
        email: true,
        role: true,
        isSuperAdmin: true,
        organizationId: true,
      },
    });

    if (!user) {
      throw new NotFoundException(
        `The designated account (${configuredEmail}) does not exist. Please register the account first.`,
      );
    }

    if (user.isSuperAdmin) {
      return {
        success: true,
        message: `Account ${configuredEmail} is already provisioned as a Super Admin`,
        email: user.email,
        alreadyPromoted: true,
      };
    }

    // Atomically promote the designated user
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { isSuperAdmin: true },
      select: {
        id: true,
        email: true,
        role: true,
        isSuperAdmin: true,
        organizationId: true,
      },
    });

    await this.audit.record({
      organizationId: updated.organizationId,
      userId: updated.id,
      action: 'super_admin.bootstrap_granted',
      entityType: 'User',
      entityId: updated.id,
      status: 'success',
      metadata: { email: updated.email },
      ipAddress: ip,
    });

    this.logger.log(
      `[SuperAdminBootstrap] Account ${configuredEmail} successfully promoted to Super Admin via secure bootstrap.`,
    );

    return {
      success: true,
      message: `Super Admin privileges successfully granted to ${configuredEmail}`,
      email: updated.email,
      alreadyPromoted: false,
    };
  }
}
