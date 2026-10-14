import Link from "next/link";
import { ReactNode, useId, useRef } from "react";
import { HiCheck } from "react-icons/hi2";

import { pluralize } from "../../lib/format";
import { useAppSelector } from "../../store";
import { IChannel } from "../../types/Message";
import { Button } from "../common/Button";
import JoinButton from "./JoinButton";
import { channelPath } from "./paths";

/** A channel's mark: "#" in a rounded square, the size of an avatar. */
export function ChannelMark({ size = 48 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size / 2 }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-primary-fill font-extrabold text-white"
    >
      #
    </span>
  );
}

/** What a channel's card says about the viewer: Owner, Moderator, Joined, or a Join button. */
function Membership({
  channel,
  onJoined,
}: {
  channel: IChannel;
  onJoined: () => void;
}) {
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const { role } = channel.viewer;
  if (!role)
    return readOnly ? null : (
      <JoinButton channel={channel} size="sm" onJoined={onJoined} />
    );
  return (
    <span className="flex items-center gap-1 rounded-full border border-line px-3 py-1 text-[13px] font-bold">
      {role === "member" && <HiCheck aria-hidden="true" />}
      {role === "owner"
        ? "Owner"
        : role === "moderator"
          ? "Moderator"
          : "Joined"}
    </span>
  );
}

function ChannelCard({ channel }: { channel: IChannel }) {
  const titleId = useId();
  const link = useRef<HTMLAnchorElement>(null);
  const { unread } = channel.viewer;
  return (
    <li className="border-b border-line">
      <article
        aria-labelledby={titleId}
        className="relative flex gap-3 px-4 py-3 transition-colors hover:bg-fg/[0.03]"
      >
        <ChannelMark />
        <div className="min-w-0 flex-1 leading-5">
          <h2 id={titleId} className="text-[15px] font-bold">
            {/* The whole card opens the channel; the Join button sits above. */}
            <Link
              ref={link}
              href={channelPath(channel.handle)}
              className="outline-offset-[-2px] [overflow-wrap:anywhere] after:absolute after:inset-0 hover:underline"
            >
              {channel.name}
            </Link>
          </h2>
          {/* Squeezed by the badge on a phone, the count wraps below the
              handle rather than being cut off. */}
          <p className="flex flex-wrap text-[15px] text-muted">
            <span className="flex min-w-0">
              <span className="truncate">#{channel.handle}</span>
              <span className="shrink-0 whitespace-pre"> · </span>
            </span>
            <span className="whitespace-nowrap">
              {pluralize(channel.memberCount, "member")}
            </span>
          </p>
          {channel.description && (
            <p className="mt-1 text-[15px] [overflow-wrap:anywhere]">
              {channel.description}
            </p>
          )}
        </div>
        <div className="relative flex shrink-0 flex-col items-end gap-2">
          {/* Joining swaps the button for "Joined": focus goes to the link. */}
          <Membership
            channel={channel}
            onJoined={() => link.current?.focus()}
          />
          {unread > 0 && (
            <span className="flex items-center gap-1.5 text-[13px] font-bold">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full bg-primary-fill"
              />
              {pluralize(unread, "new message")}
            </span>
          )}
        </div>
      </article>
    </li>
  );
}

interface ChannelListProps {
  /** An accessible name for the list's region. */
  label: string;
  channels: IChannel[];
  /** The last read failed and there is nothing to show. */
  error: string | null;
  onRetry: () => void;
  /** What shows while there are no channels. */
  empty: ReactNode;
}

/** Channel cards: name, #handle, members, description, and Join or your role. */
export default function ChannelList({
  label,
  channels,
  error,
  onRetry,
  empty,
}: ChannelListProps) {
  return (
    <section aria-label={label}>
      {channels.length > 0 ? (
        <ul>
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </ul>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 p-8 text-center text-[15px] text-muted"
        >
          <p>{error}</p>
          <Button onClick={onRetry}>Retry</Button>
        </div>
      ) : (
        empty
      )}
    </section>
  );
}

/**
 * "Your channels" beside an open channel from 1024px: one row per channel,
 * the open one highlighted, unread ones bold with a dot.
 */
export function ChannelPane({ selected }: { selected: string }) {
  const { items } = useAppSelector((state) => state.channels.mine);

  return (
    <>
      <div className="flex min-h-[53px] items-center gap-6 border-b border-line px-4">
        <h2 className="min-w-0 flex-1 truncate text-xl font-bold">
          Your channels
        </h2>
        <Link
          href="/channels?tab=discover"
          className="rounded-full px-3 py-1.5 text-[15px] font-bold text-primary transition-colors hover:bg-primary/10"
        >
          Discover
        </Link>
      </div>
      <nav
        aria-label="Your channels"
        className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
      >
        {items.length === 0 ? (
          <p className="p-8 text-center text-[15px] text-muted">
            Channels you join show here.
          </p>
        ) : (
          <ul>
            {items.map((channel) => {
              const current = channel.handle === selected;
              const unread = channel.viewer.unread > 0;
              return (
                <li key={channel.id}>
                  <Link
                    href={channelPath(channel.handle)}
                    aria-current={current ? "page" : undefined}
                    className={`flex items-center gap-3 border-r-2 px-4 py-3 outline-offset-[-2px] transition-colors hover:bg-fg/[0.03] ${
                      current
                        ? "border-primary bg-subtle"
                        : "border-transparent"
                    }`}
                  >
                    <ChannelMark size={40} />
                    <span className="min-w-0 flex-1 leading-5">
                      <span
                        className={`block truncate text-[15px] ${unread ? "font-extrabold" : "font-bold"}`}
                      >
                        {channel.name}
                      </span>
                      <span className="block truncate text-[15px] text-muted">
                        #{channel.handle}
                      </span>
                    </span>
                    {unread && (
                      <>
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary-fill"
                        />
                        <span className="sr-only">, unread</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </>
  );
}
