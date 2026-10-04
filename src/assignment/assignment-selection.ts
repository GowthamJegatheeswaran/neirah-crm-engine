import { LeadPriority, LeadSource } from '../leads/lead.enums';
import { AssignmentStrategy, TerritoryMode } from './assignment.enums';

/**
 * Pure decision logic of the assignment engine: no database, no framework.
 * Keeping it pure makes every rule and tie-break easy to unit test.
 */

export interface RuleConditions {
  matchService: string | null;
  matchLocation: string | null;
  matchSource: LeadSource | null;
  matchPriority: LeadPriority | null;
  minValue: number | null;
  maxValue: number | null;
}

export interface RulePolicy {
  id: number;
  name: string;
  territoryMode: TerritoryMode;
  respectWorkloadLimit: boolean;
  strategy: AssignmentStrategy;
}

export interface LeadFacts {
  service: string;
  location: string;
  source: LeadSource;
  priority: LeadPriority;
  estimatedValue: number;
}

export interface Candidate {
  id: number;
  fullName: string;
  territory: string;
  maxWorkload: number;
  /** Open (not converted/lost) leads currently owned by the employee. */
  openLeads: number;
  /** Id of the employee's latest assignment-history row; 0 = never assigned. Higher = more recent. */
  lastAssignmentRank: number;
  territoryMatch: boolean;
}

export type TieBreak = 'none' | 'least_recently_assigned' | 'lowest_id';

export interface Exclusion {
  employeeId: number;
  reason: string;
}

export interface SelectionResult {
  chosen: Candidate | null;
  /** Everyone still eligible after the rule's filters, in final ranking order (best first). */
  ranked: Candidate[];
  excluded: Exclusion[];
  tieBreak: TieBreak;
  reason: string;
}

const same = (a: string | null, b: string) =>
  a === null || a.trim().toLowerCase() === b.trim().toLowerCase();

export function ruleMatchesLead(rule: RuleConditions, lead: LeadFacts): boolean {
  return (
    same(rule.matchService, lead.service) &&
    same(rule.matchLocation, lead.location) &&
    (rule.matchSource === null || rule.matchSource === lead.source) &&
    (rule.matchPriority === null || rule.matchPriority === lead.priority) &&
    (rule.minValue === null || lead.estimatedValue >= rule.minValue) &&
    (rule.maxValue === null || lead.estimatedValue <= rule.maxValue)
  );
}

function compare(strategy: AssignmentStrategy) {
  return (a: Candidate, b: Candidate): number => {
    if (strategy === AssignmentStrategy.LEAST_WORKLOAD && a.openLeads !== b.openLeads) {
      return a.openLeads - b.openLeads;
    }
    if (a.lastAssignmentRank !== b.lastAssignmentRank) {
      return a.lastAssignmentRank - b.lastAssignmentRank;
    }
    return a.id - b.id;
  };
}

function detectTieBreak(
  strategy: AssignmentStrategy,
  first: Candidate,
  second?: Candidate,
): TieBreak {
  if (!second) return 'none';
  if (strategy === AssignmentStrategy.LEAST_WORKLOAD && first.openLeads !== second.openLeads) {
    return 'none';
  }
  return first.lastAssignmentRank !== second.lastAssignmentRank
    ? 'least_recently_assigned'
    : 'lowest_id';
}

/**
 * Applies the rule's workload and territory policy to candidates that already passed the
 * database filters (active, available, specialization), then picks one deterministically.
 *
 * Ranking:  least_workload -> fewest open leads, then least recently assigned, then lowest id
 *           round_robin    -> least recently assigned, then lowest id
 * The employee id is the final key, so the same input always gives the same answer.
 */
export function selectEmployee(candidates: Candidate[], rule: RulePolicy): SelectionResult {
  const excluded: Exclusion[] = [];
  let pool = [...candidates];

  if (rule.respectWorkloadLimit) {
    pool = pool.filter((c) => {
      if (c.openLeads >= c.maxWorkload) {
        excluded.push({
          employeeId: c.id,
          reason: `at workload limit (${c.openLeads}/${c.maxWorkload} open leads)`,
        });
        return false;
      }
      return true;
    });
  }

  if (rule.territoryMode === TerritoryMode.REQUIRED) {
    pool = pool.filter((c) => {
      if (!c.territoryMatch) {
        excluded.push({ employeeId: c.id, reason: `territory '${c.territory}' does not match` });
        return false;
      }
      return true;
    });
  } else if (rule.territoryMode === TerritoryMode.PREFERRED && pool.some((c) => c.territoryMatch)) {
    pool = pool.filter((c) => {
      if (!c.territoryMatch) {
        excluded.push({
          employeeId: c.id,
          reason: `territory '${c.territory}' not preferred (a territory match exists)`,
        });
        return false;
      }
      return true;
    });
  }

  if (pool.length === 0) {
    return {
      chosen: null,
      ranked: [],
      excluded,
      tieBreak: 'none',
      reason: `Rule '${rule.name}' matched, but no eligible employee remained`,
    };
  }

  const ranked = pool.sort(compare(rule.strategy));
  const chosen = ranked[0];
  const tieBreak = detectTieBreak(rule.strategy, chosen, ranked[1]);

  const basis =
    rule.strategy === AssignmentStrategy.LEAST_WORKLOAD
      ? `lowest workload (${chosen.openLeads}/${chosen.maxWorkload} open leads)`
      : 'round robin (least recently assigned)';
  const tie =
    tieBreak === 'least_recently_assigned'
      ? '; tie broken by least recently assigned'
      : tieBreak === 'lowest_id'
        ? '; tie broken by lowest employee id'
        : '';
  return {
    chosen,
    ranked,
    excluded,
    tieBreak,
    reason: `Rule '${rule.name}': ${chosen.fullName} chosen by ${basis} among ${ranked.length} eligible${tie}`,
  };
}
