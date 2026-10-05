export enum FollowUpType {
  CALL = 'call',
  MEETING = 'meeting',
  EMAIL = 'email',
  OTHER = 'other',
}

/**
 * pending   -> waiting for the due time
 * overdue   -> due time passed and nobody completed it (set by the SLA processor)
 * completed / cancelled -> final, never change again
 */
export enum FollowUpStatus {
  PENDING = 'pending',
  OVERDUE = 'overdue',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

/** Follow-ups that still need work. */
export const OPEN_FOLLOW_UP_STATUSES: readonly FollowUpStatus[] = [
  FollowUpStatus.PENDING,
  FollowUpStatus.OVERDUE,
];
