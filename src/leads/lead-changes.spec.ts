import { computeLeadChanges } from './lead-changes';

const current = {
  name: 'Acme',
  email: null,
  phone: null,
  company: 'Acme Ltd',
  source: 'manual',
  service: 'SMB',
  location: 'Colombo',
  estimatedValue: 100,
  priority: 'medium',
} as never;

describe('computeLeadChanges', () => {
  it('returns only fields whose value really changed', () => {
    const changes = computeLeadChanges(current, { name: 'Acme', service: 'Enterprise' });
    expect(Object.keys(changes)).toEqual(['service']);
    expect(changes.service).toEqual({ from: 'SMB', to: 'Enterprise' });
  });

  it('ignores fields that were not sent but detects clearing to null', () => {
    const changes = computeLeadChanges(current, { company: null });
    expect(changes.company).toEqual({ from: 'Acme Ltd', to: null });
    expect(Object.keys(computeLeadChanges(current, {}))).toHaveLength(0);
  });
});
