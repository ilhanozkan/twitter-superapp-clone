import { ReactNode, useEffect, useRef } from "react";
import { HiXMark } from "react-icons/hi2";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name; also shown as a heading unless `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * A modal built on the native <dialog>: the browser traps focus, closes it on
 * Escape and restores focus to whatever opened it. Clicking the backdrop also
 * closes it. Mark the element to focus first with `data-autofocus`.
 */
export default function Dialog({
  open,
  onClose,
  title,
  hideTitle = false,
  children,
  className = "",
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      element.showModal();
      // showModal() focuses the first focusable element (the close button);
      // move focus to the field the content asked for instead.
      element.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onClose={onClose}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // Clicks on the ::backdrop target the dialog element itself. So does
        // a drag from inside to outside (selecting text), which must not
        // close it: the press has to start on the backdrop too.
        if (pressedBackdrop.current && event.target === event.currentTarget)
          onClose();
        pressedBackdrop.current = false;
      }}
      className={`w-[min(600px,calc(100vw-2rem))] rounded-2xl bg-surface p-0 text-fg shadow-xl backdrop:bg-[rgb(91_112_131/0.4)] ${className}`}
    >
      {open && (
        <div className="p-4">
          <div className="mb-2 flex items-center gap-4">
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="-m-2 rounded-full p-2 text-xl transition-colors hover:bg-fg/10"
            >
              <HiXMark aria-hidden="true" />
            </button>
            <h2 className={hideTitle ? "sr-only" : "text-xl font-bold"}>
              {title}
            </h2>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
