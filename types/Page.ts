/** A cursor-paginated slice of a list. `nextCursor` is null on the last page. */
export interface IPage<T> {
  items: T[];
  nextCursor: string | null;
}
