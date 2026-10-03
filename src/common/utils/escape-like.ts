/**
 * Makes user text safe to put inside a LIKE / ILIKE pattern.
 * Without this, a search for "50%" or "a_b" would act as a wildcard.
 * (SQL injection is already prevented by query parameters; this is only about wildcards.)
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
