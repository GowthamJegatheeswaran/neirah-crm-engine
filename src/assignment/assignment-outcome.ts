import { AssignmentAction, AssignmentMode } from './assignment.enums';
import { TieBreak } from './assignment-selection';

export interface CandidateView {
  id: number;
  fullName: string;
  openLeads: number;
  maxWorkload: number;
  territoryMatch: boolean;
}

/** What the engine (or a manual reassignment) decided, in a shape that is safe to return from the API. */
export interface AssignmentOutcome {
  leadId: number;
  /** true when an employee now owns the lead. */
  assigned: boolean;
  action: AssignmentAction;
  mode: AssignmentMode;
  /** true for previews: nothing was written. */
  dryRun: boolean;
  employee: { id: number; fullName: string } | null;
  rule: { id: number; name: string } | null;
  reason: string;
  tieBreak: TieBreak;
  /** Eligible employees in ranking order, best first. */
  candidates: CandidateView[];
  excluded: { employeeId: number; reason: string }[];
}
