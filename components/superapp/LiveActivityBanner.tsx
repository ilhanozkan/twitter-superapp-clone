import LiveActivityRow from "./LiveActivityRow";
import { useLiveActivity } from "./useLiveActivity";

/**
 * The first thing in progress, under the page header where there is no
 * right column (below 1024px, and on wide pages). `className` hides it
 * where the card shows instead.
 */
export default function LiveActivityBanner({
  className = "",
}: {
  className?: string;
}) {
  const [first] = useLiveActivity();
  if (!first) return null;

  return (
    <section
      aria-label="Live activity"
      className={`border-t border-line ${className}`}
    >
      <LiveActivityRow item={first} compact />
    </section>
  );
}
