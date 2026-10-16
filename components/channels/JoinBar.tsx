import { IChannel } from "../../types/Message";
import JoinButton from "./JoinButton";

/** Where the composer would be for someone who hasn't joined. */
export default function JoinBar({
  channel,
  onJoined,
}: {
  channel: IChannel;
  onJoined: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-line bg-surface px-4 py-3">
      <p className="min-w-0 flex-1 text-[15px] font-bold">
        Join to send messages
      </p>
      <JoinButton channel={channel} onJoined={onJoined} />
    </div>
  );
}
