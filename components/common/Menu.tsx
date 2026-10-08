import {
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

interface MenuProps {
  /** Accessible name of the trigger button, e.g. "More options". */
  label: string;
  trigger: ReactNode;
  items: MenuItem[];
  triggerClassName?: string;
  /** Which edge of the trigger the menu aligns to. */
  align?: "left" | "right";
  /** Open above the trigger (for buttons at the bottom of the screen). */
  placement?: "below" | "above";
}

/**
 * A menu button following the WAI-ARIA menu pattern: Enter/Space/ArrowDown
 * open it, arrow keys move between items, Escape and outside clicks close it
 * and focus returns to the trigger.
 */
export default function Menu({
  label,
  trigger,
  items,
  triggerClassName = "",
  align = "right",
  placement = "below",
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  const onMenuKeyDown = (event: ReactKeyboardEvent) => {
    const focusable = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const index = focusable.indexOf(
      document.activeElement as HTMLButtonElement
    );

    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      focusable[(index + step + focusable.length) % focusable.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusable[event.key === "Home" ? 0 : focusable.length - 1]?.focus();
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={triggerClassName}
      >
        {trigger}
      </button>

      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          onClick={(event) => event.stopPropagation()}
          className={`absolute z-30 min-w-56 overflow-hidden rounded-xl bg-surface py-1 shadow-[0_0_15px_rgb(0_0_0/0.15),0_0_3px_1px_rgb(0_0_0/0.1)] ${
            align === "right" ? "right-0" : "left-0"
          } ${placement === "above" ? "bottom-full mb-2" : "top-full mt-1"}`}
        >
          {items.map((item, index) => (
            <button
              key={item.label}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-bold hover:bg-fg/5 focus:bg-fg/5 focus:outline-none ${
                item.danger ? "text-red-600" : ""
              }`}
            >
              {item.icon && (
                <span aria-hidden="true" className="text-xl">
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
