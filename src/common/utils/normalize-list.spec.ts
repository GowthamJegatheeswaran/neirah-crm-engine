import { normalizeList } from './normalize-list';

describe('normalizeList', () => {
  it('trims, removes empty items and de-duplicates ignoring case', () => {
    expect(normalizeList([' Enterprise ', 'enterprise', '', 'SMB', '  '])).toEqual([
      'Enterprise',
      'SMB',
    ]);
  });

  it('keeps non-text items so validation can reject them', () => {
    expect(normalizeList(['A', 5])).toEqual(['A', 5]);
  });
});
