// Search semantics shared by both repositories, mirroring GROQ's `match`:
// text is split into words (letters, digits and "_"), every query word must
// be the start of a word in the same field, and punctuation is ignored.
// "#SuperApp", "@devmarco" and "Rossi Marco" therefore behave the same in
// the in-memory store and in Sanity.

const WORD = /[\p{L}\p{N}_]+/gu;

export function searchWords(text: string): string[] {
  return text.toLowerCase().match(WORD) ?? [];
}

/** Query words to match as prefixes; empty when nothing searchable remains (e.g. "!!!"). */
export function searchTerms(query: string): string[] {
  return searchWords(query);
}

export function matchesSearch(fields: string[], terms: string[]): boolean {
  if (terms.length === 0) return false;
  return fields.some((field) => {
    const words = searchWords(field);
    return terms.every((term) => words.some((word) => word.startsWith(term)));
  });
}
