/** The "Demo" pill next to every balance: credits have no cash value. */
export default function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Demo credits · no cash value"
      className={`inline-flex shrink-0 items-center rounded-full bg-fg/10 px-2 text-[13px] font-bold leading-5 text-fg ${className}`}
    >
      Demo
    </span>
  );
}
