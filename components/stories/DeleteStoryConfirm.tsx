import { useEffect, useId, useRef } from "react";

import { Button } from "../common/Button";

/**
 * "Delete this story?" over the story in the viewer. It is part of the
 * viewer's dialog rather than a dialog of its own, so closing it can never
 * close the viewer too; the viewer handles Esc and keeps the story paused.
 */
export default function DeleteStoryConfirm({
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirm = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const errorId = useId();

  useEffect(() => {
    confirm.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby={headingId}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 rounded-t-2xl bg-surface p-4 text-fg shadow-menu"
    >
      <h3 id={headingId} className="text-[17px] font-bold">
        Delete this story?
      </h3>
      <p className="text-[15px] text-muted">
        It disappears for everyone now, together with who saw it. This can’t be
        undone.
      </p>
      {error && (
        <p id={errorId} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <Button
        ref={confirm}
        size="lg"
        aria-describedby={error ? errorId : undefined}
        // Not `disabled`: the focused button would drop focus to the page.
        aria-disabled={busy}
        className="bg-red-600 text-white hover:bg-red-700"
        onClick={() => {
          if (!busy) onConfirm();
        }}
      >
        {busy ? "Deleting…" : "Delete"}
      </Button>
      <Button variant="outline" size="lg" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  );
}
