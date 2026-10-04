import { LeadStatus } from './lead.enums';

const S = LeadStatus;

export const ALLOWED_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  [S.NEW]: [S.ASSIGNED, S.LOST],
  [S.ASSIGNED]: [S.CONTACTED, S.LOST],
  [S.CONTACTED]: [S.QUALIFIED, S.FOLLOW_UP, S.LOST],
  [S.QUALIFIED]: [S.FOLLOW_UP, S.CONVERTED, S.LOST],
  [S.FOLLOW_UP]: [S.CONTACTED, S.QUALIFIED, S.CONVERTED, S.LOST],
  [S.CONVERTED]: [],
  [S.LOST]: [],
};

export const TERMINAL_STATUSES: readonly LeadStatus[] = [S.CONVERTED, S.LOST];

export const OPEN_LEAD_STATUSES: readonly LeadStatus[] = Object.values(S).filter(
  (s) => !TERMINAL_STATUSES.includes(s),
);

/** Ready-made SQL list, e.g. `l.status IN (${OPEN_STATUS_SQL})`. Built from constants, never from user input. */
export const OPEN_STATUS_SQL = OPEN_LEAD_STATUSES.map((s) => `'${s}'`).join(',');

// NEW and ASSIGNED are set only by the system (creation / assignment engine), never by a manual edit.
const SYSTEM_ONLY_TARGETS: readonly LeadStatus[] = [S.NEW, S.ASSIGNED];

/** Returns an error message when a manual status change is not allowed, otherwise null. */
export function validateManualTransition(from: LeadStatus, to: LeadStatus): string | null {
  if (from === to) return null;
  if (SYSTEM_ONLY_TARGETS.includes(to)) {
    return `Status '${to}' is set automatically by assignment and cannot be set manually`;
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    return `Cannot change status from '${from}' to '${to}'`;
  }
  return null;
}
