import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ApiKeyGuard, ApiKeyAuthenticatedRequest } from '../common/guards/api-key.guard';
import { AutomationsService } from './automations.service';

/**
 * External-facing trigger for WEBHOOK-type automations. Not part of the
 * normal /automations resource because it deliberately uses a different
 * auth mechanism (API key, not a user JWT) — this is meant to be called by
 * Zapier, a customer's own backend, or any script, not the dashboard UI.
 *
 * Usage: POST /api/v1/public/automations/:id/trigger
 *   Authorization: Bearer <api key from Settings > API Keys>
 *   Body: { "phoneNumber": "+1234567890" } or { "contactId": "..." },
 *         optionally with a "variables" object for the automation to use.
 */
@Controller('public/automations')
export class AutomationWebhookController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Public()
  @UseGuards(ApiKeyGuard)
  @Post(':id/trigger')
  trigger(
    @Param('id') id: string,
    @Req() req: ApiKeyAuthenticatedRequest,
    @Body() body: { phoneNumber?: string; contactId?: string; variables?: Record<string, string> },
  ) {
    return this.automationsService.triggerFromWebhook(id, req.apiKeyOrganizationId, body);
  }
}
