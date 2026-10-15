import LiveActivityRow from "./LiveActivityRow";
import { useLiveActivity } from "./useLiveActivity";

/** Orders and rides in progress, in the right column (from 1024px). */
export default function LiveActivityCard() {
  const items = useLiveActivity();
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="live-activity-heading"
      className="overflow-hidden rounded-2xl bg-subtle"
    >
      <h2
        id="live-activity-heading"
        className="px-4 pb-1 pt-3 text-xl font-extrabold"
      >
        Happening now
      </h2>
      <ul>
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`}>
            <LiveActivityRow item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
