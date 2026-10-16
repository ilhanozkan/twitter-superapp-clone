// Stands in for the `sanity` package when the app's tests load the Studio's
// schema files (vitest.config.ts aliases it): only sanity/ installs the
// Studio, and the app's CI job doesn't. Its define helpers return their
// argument unchanged, so the schemas load as the plain objects the Studio
// reads.

export const defineType = <T>(definition: T): T => definition;
export const defineField = <T>(definition: T): T => definition;
export const defineArrayMember = <T>(definition: T): T => definition;

/** The published id of a draft or release version, like Sanity's helper. */
export function getPublishedId(id: string): string {
  return id.replace(/^drafts\./, "").replace(/^versions\.[^.]+\./, "");
}
