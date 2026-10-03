/**
 * Trims every text item, drops empty ones and removes duplicates (ignoring case).
 * Non-text items are kept as they are so the validator can reject them.
 */
export function normalizeList(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  const result: unknown[] = [];
  for (const item of values) {
    if (typeof item !== 'string') {
      result.push(item);
      continue;
    }
    const trimmed = item.trim();
    const key = trimmed.toLowerCase();
    if (trimmed === '' || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
