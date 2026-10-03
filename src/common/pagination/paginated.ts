export interface PageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export function buildPage<T>(data: T[], total: number, page: number, limit: number): Paginated<T> {
  return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

export function offsetFor(page: number, limit: number): number {
  return (page - 1) * limit;
}
