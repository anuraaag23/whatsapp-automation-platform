import { IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { QUOTA_RESOURCES, QuotaResource } from '../../quota/quota.service';

/**
 * Body for PATCH /super-admin/quotas/:organizationId/override.
 *
 * `value` semantics (see quota.service.ts for where these are interpreted):
 *   null           -> clear the override, defer to the plan default
 *   -1             -> explicitly unlimited for this org, regardless of plan
 *   0 or positive  -> a hard limit
 *   anything else  -> rejected here, at the HTTP boundary, as a 400 —
 *                     never left for the database or QuotaService to
 *                     discover the hard way.
 *
 * `@IsInt()` already rejects decimals, NaN, and Infinity (all fail
 * Number.isInteger, which is what @IsInt checks under the hood) as well as
 * non-numeric values entirely (strings that don't cleanly coerce, booleans,
 * objects, etc.) — no separate NaN/Infinity check needed on top of it.
 * `@Min(-1)` then rejects every other negative number (-2, -100, ...).
 */
export class SetQuotaOverrideDto {
  @IsIn(QUOTA_RESOURCES)
  resource!: QuotaResource;

  @ValidateIf((_, value) => value !== null)
  @IsInt({ message: 'value must be a whole number (or null to clear the override)' })
  @Min(-1, { message: 'value must be -1 (unlimited), 0, or a positive integer' })
  value!: number | null;
}

/** Body for PATCH /super-admin/quotas/:organizationId/plan. null removes the plan (organization becomes unlimited on every resource with no override). */
export class SetOrganizationPlanDto {
  @ValidateIf((_, value) => value !== null)
  @IsString()
  planId!: string | null;
}
