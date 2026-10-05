/** What the system does when a lead breaches its SLA. */
export enum SlaAction {
  /** Only record the breach and flag the lead (managers see it in escalations). */
  FLAG = 'flag',
  /** Flag it AND move the lead to another eligible employee using the assignment rules. */
  REASSIGN = 'reassign',
}

/** What actually happened when a breach was escalated. */
export enum EscalationOutcome {
  FLAGGED = 'flagged',
  REASSIGNED = 'reassigned',
  /** Reassignment was wanted but nobody else was eligible: the owner is kept. */
  NO_ELIGIBLE = 'no_eligible',
}

/**
 * Which event started the SLA clock that was breached.
 * assignment = the lead was (re)assigned, activity = the owner last did something qualifying.
 */
export enum ReferenceType {
  ASSIGNMENT = 'assignment',
  ACTIVITY = 'activity',
}
