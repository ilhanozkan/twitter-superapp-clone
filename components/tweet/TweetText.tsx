import Link from "next/link";
import { Fragment, useMemo } from "react";

import { displayUrl, tokenizeTweet } from "../../lib/text";

interface TweetTextProps {
  text: string;
  className?: string;
}

const linkClass = "text-primary hover:underline";

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
                className={linkClass}
              >
                {token.value}
              </Link>
            );
          case "mention":
            return (
              <Link
                key={index}
                href={`/${token.username}`}
                className={linkClass}
              >
                {token.value}
              </Link>
            );
          case "url":
            return (
              <a
                key={index}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className={linkClass}
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
