import { IAuthor } from "../../types/User";
import Avatar from "../common/Avatar";

export type StoryRing = "unseen" | "seen" | "none";

const RINGS: Record<StoryRing, string> = {
  // Instagram-like: a warm gradient while something is new...
  unseen: "bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-600",
  // ...grey once everything is watched.
  seen: "bg-banner",
  none: "bg-transparent",
};

/**
 * An avatar inside a story ring. The ring is decorative: whatever it shows
 * ("2 new") is also in the accessible name of the control around it.
 */
export default function StoryRingAvatar({
  user,
  size,
  ring,
}: {
  user: Pick<IAuthor, "fullname" | "image">;
  /** Diameter of the photo in pixels; the ring adds 5px on each side. */
  size: number;
  ring: StoryRing;
}) {
  return (
    <span
      data-ring={ring}
      className={`inline-flex shrink-0 rounded-full p-[3px] ${RINGS[ring]}`}
    >
      <span className="inline-flex rounded-full bg-surface p-[2px]">
        <Avatar user={user} size={size} />
      </span>
    </span>
  );
}
