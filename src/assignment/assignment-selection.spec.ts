import { LeadPriority, LeadSource } from '../leads/lead.enums';
import { AssignmentStrategy, TerritoryMode } from './assignment.enums';
import {
  Candidate,
  LeadFacts,
  RuleConditions,
  RulePolicy,
  ruleMatchesLead,
  selectEmployee,
} from './assignment-selection';

const cand = (id: number, over: Partial<Candidate> = {}): Candidate => ({
  id,
  fullName: `Emp${id}`,
  territory: 'Colombo',
  maxWorkload: 10,
  openLeads: 0,
  lastAssignmentRank: 0,
  territoryMatch: true,
  ...over,
});

const policy = (over: Partial<RulePolicy> = {}): RulePolicy => ({
  id: 1,
  name: 'R1',
  territoryMode: TerritoryMode.PREFERRED,
  respectWorkloadLimit: true,
  strategy: AssignmentStrategy.LEAST_WORKLOAD,
  ...over,
});

describe('ruleMatchesLead', () => {
  const lead: LeadFacts = {
    service: 'Enterprise',
    location: 'Colombo',
    source: LeadSource.WEBSITE,
    priority: LeadPriority.HIGH,
    estimatedValue: 5000,
  };
  const any: RuleConditions = {
    matchService: null,
    matchLocation: null,
    matchSource: null,
    matchPriority: null,
    minValue: null,
    maxValue: null,
  };

  it('a rule without conditions matches every lead', () => {
    expect(ruleMatchesLead(any, lead)).toBe(true);
  });

  it('compares service and location ignoring case and spaces', () => {
    expect(ruleMatchesLead({ ...any, matchService: ' enterprise ' }, lead)).toBe(true);
    expect(ruleMatchesLead({ ...any, matchLocation: 'Kandy' }, lead)).toBe(false);
  });

  it('requires every set condition to match', () => {
    expect(
      ruleMatchesLead(
        { ...any, matchSource: LeadSource.WEBSITE, matchPriority: LeadPriority.LOW },
        lead,
      ),
    ).toBe(false);
  });

  it('value range is inclusive at both ends', () => {
    expect(ruleMatchesLead({ ...any, minValue: 5000, maxValue: 5000 }, lead)).toBe(true);
    expect(ruleMatchesLead({ ...any, minValue: 5000.01 }, lead)).toBe(false);
    expect(ruleMatchesLead({ ...any, maxValue: 4999.99 }, lead)).toBe(false);
  });
});

describe('selectEmployee', () => {
  it('returns nobody when there are no candidates', () => {
    const r = selectEmployee([], policy());
    expect(r.chosen).toBeNull();
    expect(r.reason).toMatch(/no eligible employee/);
  });

  it('picks the lowest workload', () => {
    const r = selectEmployee(
      [cand(1, { openLeads: 5 }), cand(2, { openLeads: 1 }), cand(3, { openLeads: 3 })],
      policy(),
    );
    expect(r.chosen?.id).toBe(2);
    expect(r.tieBreak).toBe('none');
    expect(r.ranked.map((c) => c.id)).toEqual([2, 3, 1]);
  });

  it('breaks an equal-workload tie by least recently assigned', () => {
    const r = selectEmployee(
      [
        cand(1, { openLeads: 2, lastAssignmentRank: 90 }),
        cand(2, { openLeads: 2, lastAssignmentRank: 40 }),
      ],
      policy(),
    );
    expect(r.chosen?.id).toBe(2);
    expect(r.tieBreak).toBe('least_recently_assigned');
  });

  it('treats never-assigned as least recent and finally falls back to lowest id', () => {
    const r = selectEmployee(
      [cand(7, { openLeads: 2 }), cand(3, { openLeads: 2 }), cand(5, { openLeads: 2 })],
      policy(),
    );
    expect(r.chosen?.id).toBe(3);
    expect(r.tieBreak).toBe('lowest_id');
  });

  it('gives the same answer regardless of input order', () => {
    const list = [cand(4, { openLeads: 1 }), cand(2, { openLeads: 1 }), cand(9, { openLeads: 1 })];
    const a = selectEmployee([...list], policy()).chosen?.id;
    const b = selectEmployee([...list].reverse(), policy()).chosen?.id;
    expect(a).toBe(b);
    expect(a).toBe(2);
  });

  it('skips employees at their workload limit when the rule respects it', () => {
    const r = selectEmployee(
      [cand(1, { openLeads: 10, maxWorkload: 10 }), cand(2, { openLeads: 4 })],
      policy(),
    );
    expect(r.chosen?.id).toBe(2);
    expect(r.excluded).toEqual([{ employeeId: 1, reason: 'at workload limit (10/10 open leads)' }]);
  });

  it('returns nobody when everyone is at the limit', () => {
    const r = selectEmployee([cand(1, { openLeads: 3, maxWorkload: 3 })], policy());
    expect(r.chosen).toBeNull();
  });

  it('ignores the workload limit when the rule does not respect it', () => {
    const r = selectEmployee(
      [cand(1, { openLeads: 10, maxWorkload: 10 })],
      policy({ respectWorkloadLimit: false }),
    );
    expect(r.chosen?.id).toBe(1);
  });

  it('required territory excludes non-matching employees', () => {
    const r = selectEmployee(
      [cand(1, { territoryMatch: false, territory: 'Kandy' })],
      policy({ territoryMode: TerritoryMode.REQUIRED }),
    );
    expect(r.chosen).toBeNull();
    expect(r.excluded[0].reason).toMatch(/does not match/);
  });

  it('preferred territory narrows to matches when any exist', () => {
    const r = selectEmployee(
      [
        cand(1, { openLeads: 0, territoryMatch: false }),
        cand(2, { openLeads: 5, territoryMatch: true }),
      ],
      policy(),
    );
    expect(r.chosen?.id).toBe(2);
  });

  it('preferred territory falls back to everyone when nobody matches', () => {
    const r = selectEmployee(
      [
        cand(1, { openLeads: 3, territoryMatch: false }),
        cand(2, { openLeads: 1, territoryMatch: false }),
      ],
      policy(),
    );
    expect(r.chosen?.id).toBe(2);
  });

  it('ignore territory mode never looks at territory', () => {
    const r = selectEmployee(
      [cand(1, { openLeads: 0, territoryMatch: false }), cand(2, { openLeads: 5 })],
      policy({ territoryMode: TerritoryMode.IGNORE }),
    );
    expect(r.chosen?.id).toBe(1);
  });

  it('round robin ignores workload size and uses least recently assigned', () => {
    const r = selectEmployee(
      [
        cand(1, { openLeads: 0, lastAssignmentRank: 50 }),
        cand(2, { openLeads: 8, lastAssignmentRank: 10 }),
      ],
      policy({ strategy: AssignmentStrategy.ROUND_ROBIN }),
    );
    expect(r.chosen?.id).toBe(2);
  });

  it('writes a readable reason', () => {
    const r = selectEmployee([cand(1, { openLeads: 2 })], policy());
    expect(r.reason).toBe(
      "Rule 'R1': Emp1 chosen by lowest workload (2/10 open leads) among 1 eligible",
    );
  });
});
