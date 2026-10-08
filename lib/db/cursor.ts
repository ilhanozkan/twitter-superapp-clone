import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants";

/** Position of the last item of a page: (createdAt, id) is unique and totally ordered. */
export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString(
    "base64url"
  );
}

/** Returns null for anything that is not a cursor produced by `encodeCursor`. */
export function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;

  const decoded = Buffer.from(value, "base64url").toString("utf8");
  const separator = decoded.indexOf("|");
  if (separator <= 0) return null;

  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (!id || Number.isNaN(Date.parse(createdAt))) return null;

  return { createdAt, id };
}

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

/** Newest first; ties on the timestamp fall back to the id so paging is stable. */
export function compareNewestFirst(a: Cursor, b: Cursor): number {
  const byDate = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (byDate !== 0) return byDate;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/** True if `item` sorts strictly after `cursor` in newest-first order. */
export function isAfterCursor(item: Cursor, cursor: Cursor): boolean {
  return compareNewestFirst(cursor, item) < 0;
}
