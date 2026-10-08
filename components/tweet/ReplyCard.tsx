import Link from "next/link";

import { IReply } from "../../types/Tweet";
import Avatar from "../common/Avatar";
import RelativeTime from "../common/RelativeTime";
import { profilePath } from "./paths";
import TweetText from "./TweetText";

export default function ReplyCard({
  reply,
  replyingTo,
}: {
  reply: IReply;
  replyingTo: string;
}) {
  const profile = profilePath(reply.author.username);

  return (
    <article
      aria-labelledby={`reply-${reply.id}-author`}
      className="flex gap-3 border-b border-line px-4 py-3"
    >
      <Link
        href={profile}
        tabIndex={-1}
        aria-hidden="true"
        className="shrink-0"
      >
        <Avatar user={reply.author} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[15px] leading-5">
          <Link
            id={`reply-${reply.id}-author`}
            href={profile}
            className="truncate font-bold hover:underline"
          >
            {reply.author.fullname}
          </Link>
          <Link href={profile} tabIndex={-1} className="truncate text-muted">
            @{reply.author.username}
          </Link>
          <span aria-hidden="true" className="text-muted">
            ·
          </span>
          <span className="shrink-0 text-muted">
            <RelativeTime iso={reply.createdAt} />
          </span>
        </div>
        <p className="text-[15px] text-muted">
          Replying to{" "}
          <Link
            href={profilePath(replyingTo)}
            className="text-primary hover:underline"
          >
            @{replyingTo}
          </Link>
        </p>
        <TweetText text={reply.text} className="mt-1 text-[15px] leading-5" />
      </div>
    </article>
  );
}
