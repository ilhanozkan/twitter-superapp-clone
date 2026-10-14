import Link from "next/link";
import { RiCoinFill } from "react-icons/ri";

import { IMessage, MessageBody } from "../../types/Message";
import { StoryBackground, StoryContent } from "../../types/Story";
import { useAppSelector } from "../../store";
import Avatar from "../common/Avatar";
import { statusPath } from "../tweet/paths";
import TweetText from "../tweet/TweetText";
import { describePayment, isMine } from "./messageText";
import RequestBubble from "./RequestBubble";

type TextBody = Extract<MessageBody, { type: "text" }>;

// White text on each is at least 5:1.
const STORY_BACKGROUNDS: Record<StoryBackground, string> = {
  blue: "bg-[#1d4ed8]",
  purple: "bg-[#7e22ce]",
  green: "bg-[#15803d]",
  orange: "bg-[#c2410c]",
  pink: "bg-[#be185d]",
  slate: "bg-[#334155]",
};

/** Text in a chat bubble: mine in primary-fill with white text (links too). */
export function TextBubble({
  text,
  mine,
  className = "",
}: {
  text: string;
  mine: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl px-4 py-2 text-[15px] leading-5 ${
        mine
          ? "rounded-br-md bg-primary-fill text-white [&_a]:text-white [&_a]:decoration-white/70"
          : "rounded-bl-md bg-subtle text-fg"
      } ${className}`}
    >
      <TweetText text={text} />
    </div>
  );
}

function SharedTweet({ tweet }: { tweet: NonNullable<TextBody["tweet"]> }) {
  return (
    <Link
      href={statusPath(tweet)}
      className="block w-72 max-w-full rounded-2xl border border-line bg-surface p-3 text-left text-[15px] text-fg transition-colors hover:bg-fg/[0.03]"
    >
      <span className="sr-only">Shared Tweet by </span>
      <span className="flex min-w-0 items-center gap-2 leading-5">
        <Avatar user={tweet.author} size={20} />
        <span className="truncate font-bold">{tweet.author.fullname}</span>
        <span className="truncate text-muted">@{tweet.author.username}</span>
      </span>
      <span className="mt-1 line-clamp-4 block whitespace-pre-wrap leading-5 [overflow-wrap:anywhere]">
        {tweet.text}
      </span>
    </Link>
  );
}

function StoryPreview({ preview }: { preview: StoryContent | null }) {
  if (!preview) {
    return (
      <p className="rounded-2xl border border-line px-3 py-2 text-[13px] text-muted">
        Story no longer available
      </p>
    );
  }
  if (preview.type === "image") {
    return (
      // Story images may come from any https host, which next/image cannot allowlist.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={preview.image}
        alt={preview.alt}
        width={96}
        height={160}
        className="h-40 w-24 rounded-xl bg-subtle object-cover"
      />
    );
  }
  return (
    <p
      className={`flex h-40 w-24 items-center justify-center overflow-hidden rounded-xl p-2 text-center text-[13px] font-bold leading-4 text-white [overflow-wrap:anywhere] ${STORY_BACKGROUNDS[preview.background]}`}
    >
      {preview.text}
    </p>
  );
}

function TextMessage({
  body,
  mine,
  authorName,
}: {
  body: TextBody;
  mine: boolean;
  authorName: string;
}) {
  const { story, tweet, text } = body;
  return (
    <div
      className={`flex max-w-full flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
    >
      {story && (
        <>
          <p className="text-[13px] text-muted">
            {mine
              ? `You replied to ${story.author.fullname}’s story`
              : `${authorName} replied to your story`}
          </p>
          <StoryPreview preview={story.preview} />
        </>
      )}
      {tweet ? (
        <SharedTweet tweet={tweet} />
      ) : (
        !text && (
          <p className="rounded-2xl border border-line px-3 py-2 text-[15px] text-muted">
            This Tweet is no longer available
          </p>
        )
      )}
      {text && <TextBubble text={text} mine={mine} />}
    </div>
  );
}

/**
 * One message's content, by type: text (with a shared Tweet or a story
 * reply), a payment, a payment request, or a removed message. The list
 * around it adds the author for screen readers, the time and "Seen".
 */
export default function MessageBubble({
  message,
  viewer,
}: {
  message: IMessage;
  viewer: string;
}) {
  const walletOn = useAppSelector((state) => state.session.features.wallet);
  const mine = isMine(message.author, viewer);
  const { body } = message;

  switch (body.type) {
    case "text":
      return (
        <TextMessage
          body={body}
          mine={mine}
          authorName={message.author.fullname}
        />
      );
    case "payment":
      return (
        <div className="w-72 max-w-full rounded-2xl border border-line bg-surface p-3 text-[15px]">
          <p className="flex items-start gap-2 font-bold leading-5">
            <RiCoinFill
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-lg text-tip"
            />
            <span className="min-w-0 tabular-nums [overflow-wrap:anywhere]">
              {describePayment(message.author, body.amount, viewer)}
            </span>
          </p>
          {body.note && (
            <p className="mt-1 [overflow-wrap:anywhere]">{body.note}</p>
          )}
          {walletOn && (
            <Link
              href={`/wallet/transactions/${encodeURIComponent(body.transferId)}`}
              className="mt-2 inline-block text-[13px] font-bold text-primary underline underline-offset-2"
            >
              View receipt
            </Link>
          )}
        </div>
      );
    case "request":
      return <RequestBubble request={body.request} viewer={viewer} />;
    case "removed":
      return (
        <p className="rounded-2xl border border-dashed border-line px-3 py-2 text-[15px] italic text-muted">
          {body.by === "moderator"
            ? "Message removed by a moderator"
            : "Message deleted"}
        </p>
      );
  }
}
