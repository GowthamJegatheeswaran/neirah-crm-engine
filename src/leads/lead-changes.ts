import { Lead } from './lead.entity';

export const EDITABLE_LEAD_FIELDS = [
  'name',
  'email',
  'phone',
  'company',
  'source',
  'service',
  'location',
  'estimatedValue',
  'priority',
] as const;

export type EditableLeadField = (typeof EDITABLE_LEAD_FIELDS)[number];
export type LeadChanges = Partial<Record<EditableLeadField, { from: unknown; to: unknown }>>;

/** Compares the stored lead with the requested values and returns only what really changed. */
export function computeLeadChanges(
  current: Pick<Lead, EditableLeadField>,
  requested: Partial<Record<EditableLeadField, unknown>>,
): LeadChanges {
  const changes: LeadChanges = {};
  for (const field of EDITABLE_LEAD_FIELDS) {
    if (requested[field] === undefined) continue;
    if (requested[field] !== current[field]) {
      changes[field] = { from: current[field], to: requested[field] };
    }
  }
  return changes;
}
