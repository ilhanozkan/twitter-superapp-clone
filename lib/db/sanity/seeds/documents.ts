export interface SanitySeedDocument {
  _id: string;
  _type: string;
  _createdAt: string;
  [field: string]: unknown;
}

/** Drops null/undefined fields; Sanity stores "no value" as an absent field. */
export function compact<T extends Record<string, unknown>>(document: T): T {
  return Object.fromEntries(
    Object.entries(document).filter(
      ([, value]) => value !== null && value !== undefined
    )
  ) as T;
}
