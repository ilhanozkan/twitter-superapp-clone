import { ITrend } from "../types/Trend";

// A hashtag starts at the beginning of the text or after a character that
// cannot be part of a word, so "a#b" and URLs fragments are not hashtags.
const HASHTAG_PATTERN = /(^|[^\p{L}\p{N}_&/])#([\p{L}\p{N}_]{1,50})/gu;

/** Returns the hashtags in `text` (without "#"), de-duplicated case-insensitively, in order. */
export function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const tag = match[2];
    // Pure numbers ("#1") are not hashtags on Twitter either.
    if (/^\d+$/.test(tag)) continue;

    const key = tag.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }

  return tags;
}

/**
 * Ranks hashtags by the number of tweets using them. `texts` should be ordered
 * newest first: the casing shown for a tag is its most recent use, and ties
 * are broken by recency.
 */
export function computeTrends(texts: string[], limit: number): ITrend[] {
  const trends = new Map<
    string,
    { tag: string; count: number; rank: number }
  >();

  texts.forEach((text, index) => {
    for (const tag of extractHashtags(text)) {
      const key = tag.toLowerCase();
      const trend = trends.get(key);
      if (trend) trend.count += 1;
      else trends.set(key, { tag, count: 1, rank: index });
    }
  });

  return Array.from(trends.values())
    .sort((a, b) => b.count - a.count || a.rank - b.rank)
    .slice(0, Math.max(0, limit))
    .map(({ tag, count }) => ({ tag: `#${tag}`, tweetCount: count }));
}
