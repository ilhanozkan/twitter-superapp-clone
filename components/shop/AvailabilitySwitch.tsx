interface AvailabilitySwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The element naming it (a visible label)... */
  labelledBy?: string;
  /** ...or a name of its own. */
  label?: string;
  describedBy?: string;
  /** Can't be changed here (read-only demo); say why in `describedBy`. */
  disabled?: boolean;
  /** A change is being saved: further presses wait, focus stays. */
  busy?: boolean;
}

/**
 * An on/off switch (`role="switch"`, `aria-checked`) for a business's
 * "Accepting orders" and its products' availability. The thumb's position
 * shows the state, with 3:1 contrast against the track and the page in
 * both themes; the row next to it says it in words too.
 */
export default function AvailabilitySwitch({
  checked,
  onChange,
  labelledBy,
  label,
  describedBy,
  disabled = false,
  busy = false,
}: AvailabilitySwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      disabled={disabled}
      onClick={() => {
        if (!busy) onChange(!checked);
      }}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
        checked ? "bg-success" : "bg-muted"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-6 w-6 rounded-full bg-surface shadow transition-transform motion-reduce:transition-none ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}
