import { buildPage, offsetFor } from './paginated';

describe('pagination helpers', () => {
  it('calculates the offset from page and limit', () => {
    expect(offsetFor(1, 20)).toBe(0);
    expect(offsetFor(3, 20)).toBe(40);
  });

  it('rounds totalPages up', () => {
    expect(buildPage([], 41, 1, 20).meta.totalPages).toBe(3);
    expect(buildPage([], 40, 1, 20).meta.totalPages).toBe(2);
  });

  it('returns 0 pages for an empty result', () => {
    expect(buildPage([], 0, 1, 20).meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
  });
});
