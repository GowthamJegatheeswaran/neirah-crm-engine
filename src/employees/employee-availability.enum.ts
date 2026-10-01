/** Used by the assignment engine: only AVAILABLE employees can receive new auto-assigned leads. */
export enum EmployeeAvailability {
  AVAILABLE = 'available',
  BUSY = 'busy',
  ON_LEAVE = 'on_leave',
  UNAVAILABLE = 'unavailable',
}
