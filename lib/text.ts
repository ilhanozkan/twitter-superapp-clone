import { USERNAME_PATTERN } from "./constants";

export type TextToken =
  | { type: "text"; value: string }
  | { type: "hashtag"; value: string; tag: string }
  | { type: "mention"; value: string; username: string }
  | { type: "url"; value: string; href: string };

// URLs, or a #hashtag / @mention that starts a word (same boundary rule as
// lib/hashtags.ts, so what is linked is what is counted in trends).
const TOKEN_PATTERN =
  /(https?:\/\/[^\s<>"]+)|(?<=^|[^\p{L}\p{N}_&/@#])([#@])([\p{L}\p{N}_]{1,50})/gu;

// Punctuation that usually ends a sentence rather than a URL.
const TRAILING_PUNCTUATION = /[.,:;!?'")\]]+$/;

/** Splits tweet text into plain text, hashtags, mentions and links. */
export function tokenizeTweet(text: string): TextToken[] {
  const tokens: TextToken[] = [];
  let last = 0;

  const pushText = (value: string) => {
    if (!value) return;
    const previous = tokens[tokens.length - 1];
    if (previous?.type === "text") previous.value += value;
    else tokens.push({ type: "text", value });
  };

  for (const match of text.matchAll(TOKEN_PATTERN)) {
    const index = match.index ?? 0;
    pushText(text.slice(last, index));

    const [whole, url, sigil, word] = match;
    let consumed = whole;

    if (url) {
      const trailing = url.match(TRAILING_PUNCTUATION)?.[0] ?? "";
      const href = url.slice(0, url.length - trailing.length);
      tokens.push({ type: "url", value: href, href });
      consumed = href;
    } else if (sigil === "#" && !/^\d+$/.test(word)) {
      tokens.push({ type: "hashtag", value: whole, tag: word });
    } else if (sigil === "@" && USERNAME_PATTERN.test(word)) {
      tokens.push({ type: "mention", value: whole, username: word });
    } else {
      pushText(whole);
    }

    last = index + consumed.length;
  }

  pushText(text.slice(last));
  return tokens;
}

/** "https://example.com/very/long/path" -> "example.com/very/long/pa…" */
export function displayUrl(href: string, max = 30): string {
  const stripped = href.replace(/^https?:\/\/(www\.)?/, "");
  return stripped.length > max ? `${stripped.slice(0, max - 1)}…` : stripped;
}

/** Only http(s) URLs may become links (blocks javascript:, data:, etc.). */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}
