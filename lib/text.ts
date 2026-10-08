import { USERNAME_PATTERN } from "./constants";

export type TextToken =
  | { type: "text"; value: string }
  | { type: "hashtag"; value: string; tag: string }
  | { type: "mention"; value: string; username: string }
  | { type: "url"; value: string; href: string };

// URLs, or a #hashtag / @mention that starts a word (same boundary rule as
// lib/hashtags.ts, so what is linked is what is counted in trends). A URL
// ends at a bidi control: those could make its text read as another address.
const TOKEN_PATTERN =
  /(https?:\/\/[^\s<>"\u200E\u200F\u202A-\u202E\u2066-\u2069]+)|(?<=^|[^\p{L}\p{N}_&/@#])([#@])([\p{L}\p{N}_]{1,50})/gu;

// Bidi and other invisible controls never belong in displayed link text.
const INVISIBLE_CONTROLS =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

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
      // URLs with credentials ("https://bank.com@evil.example") hide where
      // they go, so they stay plain text, as on twitter.com.
      if (safeHref(href)) tokens.push({ type: "url", value: href, href });
      else pushText(href);
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

function decode(value: string) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

/**
 * "https://www.example.com/very/long/path" -> "example.com/very/long/pa…".
 * The host is always shown in full (internationalized hosts as punycode), so
 * the text never hides where a link goes; only the path is shortened.
 */
export function displayUrl(href: string, max = 30): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  const host = url.host.replace(/^www\./, "");
  const rest = decode(`${url.pathname}${url.search}${url.hash}`).replace(
    INVISIBLE_CONTROLS,
    ""
  );
  if (host.length + rest.length <= max) return host + rest;
  const room = Math.max(max - host.length - 1, 1);
  return `${host}${rest.slice(0, room)}…`;
}

/**
 * Only http(s) URLs without credentials may become links (blocks
 * javascript:, data:, and "https://bank.com@evil.example").
 */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.username || parsed.password ? null : parsed.href;
  } catch {
    return null;
  }
}
