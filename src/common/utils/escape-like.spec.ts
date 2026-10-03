import { escapeLike } from './escape-like';

describe('escapeLike', () => {
  it('escapes % and _ so they are matched literally', () => {
    expect(escapeLike('50%')).toBe('50\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
  });

  it('escapes the escape character itself first', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b');
  });

  it('leaves normal text unchanged', () => {
    expect(escapeLike('Ramesh Silva')).toBe('Ramesh Silva');
  });
});
