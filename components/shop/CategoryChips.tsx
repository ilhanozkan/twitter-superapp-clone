import { BUSINESS_CATEGORIES, CATEGORY_LABELS } from "../../lib/superapp/shop";
import { BusinessCategory } from "../../types/Business";

const CHIP =
  "min-h-9 shrink-0 rounded-full border px-4 text-[15px] font-bold transition-colors";

/** All, Café, Restaurant, Healthy, Shop: toggle buttons (`aria-pressed`), one pressed at a time. */
export default function CategoryChips({
  value,
  onChange,
}: {
  /** null is All. */
  value: BusinessCategory | null;
  onChange: (value: BusinessCategory | null) => void;
}) {
  const chips: { id: BusinessCategory | null; label: string }[] = [
    { id: null, label: "All" },
    ...BUSINESS_CATEGORIES.map((id) => ({ id, label: CATEGORY_LABELS[id] })),
  ];

  return (
    <div
      role="group"
      aria-label="Categories"
      className="flex flex-wrap gap-2 px-4 py-3"
    >
      {chips.map((chip) => {
        const pressed = chip.id === value;
        return (
          <button
            key={chip.label}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(chip.id)}
            className={`${CHIP} ${
              pressed
                ? "border-fg bg-fg text-surface"
                : "border-line text-fg hover:bg-fg/5"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
