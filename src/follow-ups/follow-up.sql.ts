/**
 * "Effectively overdue" = already marked overdue, OR still pending but past its due time.
 * Used in lists and the dashboard so a late follow-up shows up as late immediately, even before
 * the SLA processor has had a chance to mark it. Built from constants, never from user input.
 */
export const effectiveOverdueSql = (alias = 'f') =>
  `(${alias}.status = 'overdue' OR (${alias}.status = 'pending' AND ${alias}.due_at < now()))`;
