import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { HiXMark } from "react-icons/hi2";

import { dismissToast, Toast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";

const DURATION_MS = 4000;
// Toasts with an action ("View") stay longer, so it can be reached in time.
const ACTION_DURATION_MS = 10000;

function ToastItem({ toast }: { toast: Toast }) {
  const dispatch = useAppDispatch();
  const element = useRef<HTMLDivElement>(null);
  // Paused while hovered or focused (WCAG 2.2.1), resumed when left.
  const [paused, setPaused] = useState(false);

  const dismiss = useCallback(() => {
    // Don't drop keyboard focus to the page when the toast goes away.
    if (element.current?.contains(document.activeElement)) {
      document.getElementById("main")?.focus();
    }
    dispatch(dismissToast(toast.id));
  }, [dispatch, toast.id]);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(
      dismiss,
      toast.action ? ACTION_DURATION_MS : DURATION_MS
    );
    return () => clearTimeout(timer);
  }, [dismiss, paused, toast.action]);

  return (
    <div
      ref={element}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
      className={`pointer-events-auto flex animate-toast-in items-center gap-4 rounded-md py-2 pl-4 pr-2 text-[15px] shadow-lg ${
        toast.tone === "error"
          ? "bg-[#dc2626] text-white"
          : "bg-primary-fill text-white"
      }`}
    >
      <span>{toast.message}</span>
      {toast.action && (
        <Link
          href={toast.action.href}
          onClick={() => dispatch(dismissToast(toast.id))}
          className="font-bold underline-offset-2 hover:underline focus-visible:outline-white"
        >
          {toast.action.label}
        </Link>
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="rounded-full p-1.5 text-lg transition-colors hover:bg-white/15 focus-visible:outline-white"
      >
        <HiXMark aria-hidden="true" />
      </button>
    </div>
  );
}

/** Short confirmations ("Your Tweet was sent") announced to screen readers. */
export default function Toaster() {
  const toasts = useAppSelector((state) => state.ui.toasts);

  return (
    <div
      role="status"
      aria-live="polite"
      // On phones, above the tab bar and the floating compose button.
      className="pointer-events-none fixed inset-x-0 bottom-[calc(8.5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 xs:bottom-6"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
