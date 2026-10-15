import Link from "next/link";
import { Fragment, useMemo } from "react";

import { displayUrl, tokenizeTweet } from "../../lib/text";

interface TweetTextProps {
  text: string;
  className?: string;
}

// Links inside text need a cue besides color (WCAG 1.4.1): in the dark theme
// the link blue and the body text are too close in brightness.
export const inlineLinkClass =
  "text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary";

/** Tweet text with #hashtags, @mentions and URLs turned into links. */
export default function TweetText({ text, className = "" }: TweetTextProps) {
  const tokens = useMemo(() => tokenizeTweet(text), [text]);

  return (
    <p
      dir="auto"
      className={`whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${className}`}
    >
      {tokens.map((token, index) => {
        switch (token.type) {
          case "hashtag":
            return (
              <Link
                key={index}
                href={`/explore?q=${encodeURIComponent(`#${token.tag}`)}`}
                className={inlineLinkClass}
              >
                {token.value}
              </Link>
            );
          case "mention":
            return (
              <Link
                key={index}
                href={`/${token.username}`}
                className={inlineLinkClass}
              >
                {token.value}
              </Link>
            );
          case "url":
            return (
              <a
                key={index}
                href={token.href}
                // Isolated left-to-right, so bidi controls around the link
                // cannot make its text read as a different address.
                dir="ltr"
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className={inlineLinkClass}
              >
                {displayUrl(token.href)}
              </a>
            );
          default:
            return <Fragment key={index}>{token.value}</Fragment>;
        }
      })}
    </p>
  );
}
