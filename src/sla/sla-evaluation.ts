import { LeadPriority, LeadSource } from '../leads/lead.enums';
import { ReferenceType, SlaAction } from './sla.enums';

/**
 * Pure SLA decision logic: no database, no framework, no clock of its own (the caller passes
 * `now`). That makes every rule easy to unit test.
 */

export interface SlaConditions {
  matchPriority: LeadPriority | null;
  matchService: string | null;
  matchSource: LeadSource | null;
  minValue: number | null;
  maxValue: number | null;
}

export interface SlaPolicyFacts extends SlaConditions {
  id: number;
  name: string;
  priority: number;
  responseMinutes: number;
  action: SlaAction;
}

export interface SlaLeadFacts {
  service: string;
  source: LeadSource;
  priority: LeadPriority;
  estimatedValue: number;
}

/** The event that started the SLA clock. */
export interface SlaReference {
  type: ReferenceType;
  id: number;
  at: Date;
}

const sameText = (rule: string | null, value: string) =>
  rule === null || rule.trim().toLowerCase() === value.trim().toLowerCase();

export function policyMatchesLead(policy: SlaConditions, lead: SlaLeadFacts): boolean {
  return (
    sameText(policy.matchService, lead.service) &&
    (policy.matchSource === null || policy.matchSource === lead.source) &&
    (policy.matchPriority === null || policy.matchPriority === lead.priority) &&
    (policy.minValue === null || lead.estimatedValue >= policy.minValue) &&
    (policy.maxValue === null || lead.estimatedValue <= policy.maxValue)
  );
}

/** First matching policy by (priority asc, id asc). Inactive policies must already be filtered out. */
export function findPolicy<P extends SlaPolicyFacts>(policies: P[], lead: SlaLeadFacts): P | null {
  const ordered = [...policies].sort((a, b) => a.priority - b.priority || a.id - b.id);
  return ordered.find((p) => policyMatchesLead(p, lead)) ?? null;
}

/**
 * The SLA clock starts at the LATEST of the last assignment and the last qualifying activity.
 * On an exact tie the assignment wins (it is the more fundamental event).
 */
export function pickReference(
  lastAssignment: SlaReference | null,
  lastActivity: SlaReference | null,
): SlaReference | null {
  if (!lastAssignment) return lastActivity;
  if (!lastActivity) return lastAssignment;
  return lastActivity.at.getTime() > lastAssignment.at.getTime() ? lastActivity : lastAssignment;
}

export function slaDeadline(reference: Date, responseMinutes: number): Date {
  return new Date(reference.getTime() + responseMinutes * 60_000);
}

/** Breached = the deadline has strictly passed. Exactly at the deadline is still on time. */
export function isBreached(reference: Date, responseMinutes: number, now: Date): boolean {
  return now.getTime() > slaDeadline(reference, responseMinutes).getTime();
}

export function minutesLate(reference: Date, responseMinutes: number, now: Date): number {
  const late = now.getTime() - slaDeadline(reference, responseMinutes).getTime();
  return Math.max(0, Math.floor(late / 60_000));
}
