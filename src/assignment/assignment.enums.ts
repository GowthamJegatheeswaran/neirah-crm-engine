/** How strictly an employee's territory must match the lead's location. */
export enum TerritoryMode {
  /** Only employees in the lead's territory are eligible. */
  REQUIRED = 'required',
  /** Territory matches are preferred; if nobody matches, other eligible employees are used. */
  PREFERRED = 'preferred',
  /** Territory is not considered. */
  IGNORE = 'ignore',
}

/** How one employee is chosen when several are eligible. Both are deterministic. */
export enum AssignmentStrategy {
  /** Fewest open leads first. */
  LEAST_WORKLOAD = 'least_workload',
  /** Whoever received a lead longest ago first (ignores workload size). */
  ROUND_ROBIN = 'round_robin',
}

export enum AssignmentAction {
  ASSIGNED = 'assigned',
  REASSIGNED = 'reassigned',
  /** The engine ran but found nobody eligible. Nothing was assigned. */
  NO_ELIGIBLE = 'no_eligible',
}

export enum AssignmentMode {
  AUTOMATIC = 'automatic',
  MANUAL = 'manual',
}
