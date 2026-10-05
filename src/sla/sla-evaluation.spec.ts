import { LeadPriority, LeadSource } from '../leads/lead.enums';
import {
  findPolicy,
  isBreached,
  minutesLate,
  pickReference,
  policyMatchesLead,
  slaDeadline,
  SlaPolicyFacts,
} from './sla-evaluation';
import { ReferenceType, SlaAction } from './sla.enums';

const lead = {
  service: 'Enterprise',
  source: LeadSource.WEBSITE,
  priority: LeadPriority.HIGH,
  estimatedValue: 150_000,
};

const policy = (over: Partial<SlaPolicyFacts> = {}): SlaPolicyFacts => ({
  id: 1,
  name: 'p',
  priority: 100,
  responseMinutes: 60,
  action: SlaAction.FLAG,
  matchPriority: null,
  matchService: null,
  matchSource: null,
  minValue: null,
  maxValue: null,
  ...over,
});

const t = (iso: string) => new Date(iso);

describe('policyMatchesLead', () => {
  it('matches everything when no condition is set', () => {
    expect(policyMatchesLead(policy(), lead)).toBe(true);
  });

  it('requires every set condition to match', () => {
    expect(policyMatchesLead(policy({ matchPriority: LeadPriority.HIGH }), lead)).toBe(true);
    expect(policyMatchesLead(policy({ matchPriority: LeadPriority.LOW }), lead)).toBe(false);
    expect(
      policyMatchesLead(
        policy({ matchPriority: LeadPriority.HIGH, matchSource: LeadSource.REFERRAL }),
        lead,
      ),
    ).toBe(false);
  });

  it('compares service ignoring case and surrounding spaces', () => {
    expect(policyMatchesLead(policy({ matchService: '  enterprise ' }), lead)).toBe(true);
    expect(policyMatchesLead(policy({ matchService: 'SMB' }), lead)).toBe(false);
  });

  it('treats value bounds as inclusive', () => {
    expect(policyMatchesLead(policy({ minValue: 150_000 }), lead)).toBe(true);
    expect(policyMatchesLead(policy({ maxValue: 150_000 }), lead)).toBe(true);
    expect(policyMatchesLead(policy({ minValue: 150_001 }), lead)).toBe(false);
    expect(policyMatchesLead(policy({ maxValue: 149_999 }), lead)).toBe(false);
  });
});

describe('findPolicy', () => {
  it('returns null when nothing matches or the list is empty', () => {
    expect(findPolicy([], lead)).toBeNull();
    expect(findPolicy([policy({ matchService: 'SMB' })], lead)).toBeNull();
  });

  it('picks the lowest priority number first', () => {
    const slow = policy({ id: 1, priority: 50 });
    const fast = policy({ id: 2, priority: 10 });
    expect(findPolicy([slow, fast], lead)?.id).toBe(2);
  });

  it('breaks priority ties with the lowest id', () => {
    const a = policy({ id: 7, priority: 10 });
    const b = policy({ id: 3, priority: 10 });
    expect(findPolicy([a, b], lead)?.id).toBe(3);
  });

  it('skips a more important policy that does not match', () => {
    const specific = policy({ id: 1, priority: 1, matchPriority: LeadPriority.LOW });
    const fallback = policy({ id: 2, priority: 100 });
    expect(findPolicy([specific, fallback], lead)?.id).toBe(2);
  });

  it('does not reorder the caller array', () => {
    const list = [policy({ id: 1, priority: 50 }), policy({ id: 2, priority: 10 })];
    findPolicy(list, lead);
    expect(list.map((p) => p.id)).toEqual([1, 2]);
  });
});

describe('pickReference', () => {
  const assignment = { type: ReferenceType.ASSIGNMENT, id: 5, at: t('2026-01-01T10:00:00Z') };
  const activity = { type: ReferenceType.ACTIVITY, id: 9, at: t('2026-01-01T11:00:00Z') };

  it('uses whichever exists', () => {
    expect(pickReference(assignment, null)).toBe(assignment);
    expect(pickReference(null, activity)).toBe(activity);
    expect(pickReference(null, null)).toBeNull();
  });

  it('takes the later event', () => {
    expect(pickReference(assignment, activity)).toBe(activity);
    const lateAssignment = { ...assignment, at: t('2026-01-01T12:00:00Z') };
    expect(pickReference(lateAssignment, activity)).toBe(lateAssignment);
  });

  it('prefers the assignment on an exact tie', () => {
    const same = { ...activity, at: assignment.at };
    expect(pickReference(assignment, same)).toBe(assignment);
  });
});

describe('deadline and breach', () => {
  const start = t('2026-01-01T10:00:00Z');

  it('adds the response window to the reference', () => {
    expect(slaDeadline(start, 90).toISOString()).toBe('2026-01-01T11:30:00.000Z');
  });

  it('is not breached before or exactly at the deadline', () => {
    expect(isBreached(start, 60, t('2026-01-01T10:59:59Z'))).toBe(false);
    expect(isBreached(start, 60, t('2026-01-01T11:00:00Z'))).toBe(false);
  });

  it('is breached one millisecond after the deadline', () => {
    expect(isBreached(start, 60, t('2026-01-01T11:00:00.001Z'))).toBe(true);
  });

  it('reports whole minutes late, never negative', () => {
    expect(minutesLate(start, 60, t('2026-01-01T11:30:30Z'))).toBe(30);
    expect(minutesLate(start, 60, t('2026-01-01T10:10:00Z'))).toBe(0);
  });
});
