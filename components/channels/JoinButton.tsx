import { useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { joinChannel } from "../../slices/channelsSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch } from "../../store";
import { IChannel } from "../../types/Message";
import { Button } from "../common/Button";

interface JoinButtonProps {
  channel: Pick<IChannel, "handle">;
  size?: "sm" | "md";
  className?: string;
  /** After joining, e.g. to move focus to what replaced the button. */
  onJoined?: (channel: IChannel) => void;
}

/** "Join #handle". A failure is a toast; the button stays for another try. */
export default function JoinButton({
  channel,
  size = "md",
  className = "",
  onJoined,
}: JoinButtonProps) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);

  const join = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const joined = await dispatch(joinChannel(channel.handle));
      onJoined?.(joined);
    } catch (reason) {
      dispatch(showToast({ message: errorMessage(reason), tone: "error" }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size={size}
      aria-disabled={busy}
      onClick={join}
      className={`aria-disabled:cursor-progress ${className}`}
    >
      {busy ? "Joining…" : "Join"}
      <span className="sr-only"> #{channel.handle}</span>
    </Button>
  );
}
