import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface ApiKeyAuthenticatedRequest {
  apiKeyOrganizationId: string;
}

/**
 * Validates an API key from the Authorization header (`Bearer wap_...`)
 * against the hashed keys created in Settings > API Keys. On success,
 * attaches `apiKeyOrganizationId` to the request so the controller can
 * scope the operation to that organization — the same key can never act
 * on a different org's data.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing API key. Use: Authorization: Bearer <key>');
    }

    const rawKey = authHeader.slice('Bearer '.length).trim();
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyHash } });
    if (!apiKey || apiKey.revokedAt) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    await this.prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } });

    (request as unknown as ApiKeyAuthenticatedRequest).apiKeyOrganizationId = apiKey.organizationId;
    return true;
  }
}
