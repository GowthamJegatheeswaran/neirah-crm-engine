export enum LeadSource {
  WEBSITE = 'website',
  REFERRAL = 'referral',
  CAMPAIGN = 'campaign',
  SOCIAL_MEDIA = 'social_media',
  MANUAL = 'manual',
}

export enum LeadPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

/** Lifecycle: New -> Assigned -> Contacted -> Qualified -> Follow-Up -> Converted / Lost */
export enum LeadStatus {
  NEW = 'new',
  ASSIGNED = 'assigned',
  CONTACTED = 'contacted',
  QUALIFIED = 'qualified',
  FOLLOW_UP = 'follow_up',
  CONVERTED = 'converted',
  LOST = 'lost',
}

export enum ActivityType {
  LEAD_CREATED = 'lead_created',
  LEAD_UPDATED = 'lead_updated',
  STATUS_CHANGED = 'status_changed',
  NOTE_ADDED = 'note_added',
  ASSIGNED = 'assigned',
  REASSIGNED = 'reassigned',
  UNASSIGNED = 'unassigned',
  ASSIGNMENT_FAILED = 'assignment_failed',
  FOLLOW_UP_CREATED = 'follow_up_created',
  FOLLOW_UP_COMPLETED = 'follow_up_completed',
  FOLLOW_UP_OVERDUE = 'follow_up_overdue',
  FOLLOW_UP_CANCELLED = 'follow_up_cancelled',
  FOLLOW_UP_RESCHEDULED = 'follow_up_rescheduled',
  FOLLOW_UP_REASSIGNED = 'follow_up_reassigned',
  SLA_BREACHED = 'sla_breached',
  ESCALATED = 'escalated',
}
