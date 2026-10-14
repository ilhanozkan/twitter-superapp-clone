import Link from "next/link";
import { useState } from "react";
import { HiArrowLeft, HiOutlineInformationCircle } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { pluralize } from "../../lib/format";
import { canLeave } from "../../lib/superapp/policy/messages";
import { leaveChannel } from "../../slices/channelsSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IChannel } from "../../types/Message";
import { Button } from "../common/Button";
import { useShell } from "../layout/shell";
import LiveActivityBanner from "../superapp/LiveActivityBanner";
import JoinButton from "./JoinButton";
import { CHANNELS_PATH } from "./paths";

interface ChannelHeaderProps {
  channel: IChannel;
  headingId: string;
  onInfo: () => void;
  /** After joining from here: focus moves on, since the button goes. */
  onJoined: () => void;
  /** After leaving from here. */
  onLeft: () => void;
}

/** Leave, for members other than the owner. */
export function LeaveButton({
  channel,
  onLeft,
}: {
  channel: IChannel;
  onLeft: () => void;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const leave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await dispatch(leaveChannel(channel.handle));
      dispatch(showToast({ message: `You left #${channel.handle}` }));
      onLeft();
    } catch (reason) {
      dispatch(showToast({ message: errorMessage(reason), tone: "error" }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      aria-disabled={busy}
      onClick={leave}
      className="aria-disabled:cursor-progress"
    >
      {busy ? "Leaving…" : "Leave"}
      <span className="sr-only"> #{channel.handle}</span>
    </Button>
  );
}

/**
 * The top of a channel: "#ankara_eats", its name and member count, Join
 * or Leave (none for the owner, or in READ_ONLY), and the info button that
 * opens the members drawer.
 */
export default function ChannelHeader({
  channel,
  headingId,
  onInfo,
  onJoined,
  onLeft,
}: ChannelHeaderProps) {
  const { layout } = useShell();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const { role } = channel.viewer;

  return (
    <div className="border-b border-line bg-surface">
      <div className="flex min-h-[53px] items-center gap-3 px-4 py-1.5">
        <Link
          href={CHANNELS_PATH}
          aria-label="Back to Channels"
          className="-ml-2 rounded-full p-2 text-xl transition-colors hover:bg-fg/10 lg:hidden"
        >
          <HiArrowLeft aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1 leading-5">
          <h1
            id={headingId}
            className="truncate text-[17px] font-bold [overflow-wrap:anywhere]"
          >
            #{channel.handle}
          </h1>
          <p className="truncate text-[13px] text-muted">
            {channel.name} · {pluralize(channel.memberCount, "member")}
          </p>
        </div>
        {!readOnly &&
          (role === null ? (
            <JoinButton channel={channel} onJoined={onJoined} />
          ) : (
            canLeave(role) && <LeaveButton channel={channel} onLeft={onLeft} />
          ))}
        <button
          type="button"
          aria-label="Channel info"
          aria-haspopup="dialog"
          title="Channel info"
          onClick={onInfo}
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl transition-colors hover:bg-fg/10"
        >
          <HiOutlineInformationCircle aria-hidden="true" />
        </button>
      </div>
      <LiveActivityBanner className={layout === "wide" ? "" : "lg:hidden"} />
    </div>
  );
}
