import { Transform } from 'class-transformer';
import { ValidateIf } from 'class-validator';
import { normalizeList } from '../utils/normalize-list';

/** Trims text. An empty string becomes `undefined` (treated as "not provided"). */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    return normalized === '' ? undefined : normalized;
  });

/** Query strings arrive as "true" / "false" text. */
export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });

export const NormalizeList = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? normalizeList(value) : value,
  );

/**
 * For PATCH bodies: the field may be left out, but if it is sent it must be valid.
 * (@IsOptional() would also let `null` through, which is wrong for NOT NULL columns.)
 */
export const NotNullIfPresent = () => ValidateIf((_object, value) => value !== undefined);
