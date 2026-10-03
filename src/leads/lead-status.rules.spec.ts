import { LeadStatus as S } from './lead.enums';
import { OPEN_LEAD_STATUSES, validateManualTransition } from './lead-status.rules';

describe('lead status rules', () => {
  it('allows the normal forward flow', () => {
    expect(validateManualTransition(S.ASSIGNED, S.CONTACTED)).toBeNull();
    expect(validateManualTransition(S.CONTACTED, S.QUALIFIED)).toBeNull();
    expect(validateManualTransition(S.QUALIFIED, S.CONVERTED)).toBeNull();
    expect(validateManualTransition(S.FOLLOW_UP, S.CONTACTED)).toBeNull();
  });

  it('treats an unchanged status as a no-op', () => {
    expect(validateManualTransition(S.NEW, S.NEW)).toBeNull();
  });

  it('rejects skipping steps', () => {
    expect(validateManualTransition(S.ASSIGNED, S.CONVERTED)).toMatch(/Cannot change/);
  });

  it('rejects leaving a terminal status', () => {
    expect(validateManualTransition(S.CONVERTED, S.CONTACTED)).toMatch(/Cannot change/);
    expect(validateManualTransition(S.LOST, S.FOLLOW_UP)).toMatch(/Cannot change/);
  });

  it('rejects manually setting system-only statuses', () => {
    expect(validateManualTransition(S.CONTACTED, S.ASSIGNED)).toMatch(/automatically/);
    expect(validateManualTransition(S.LOST, S.NEW)).toMatch(/automatically/);
  });

  it('lists only non-terminal statuses as open', () => {
    expect(OPEN_LEAD_STATUSES).not.toContain(S.CONVERTED);
    expect(OPEN_LEAD_STATUSES).not.toContain(S.LOST);
    expect(OPEN_LEAD_STATUSES).toContain(S.FOLLOW_UP);
  });
});
