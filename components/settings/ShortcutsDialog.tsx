import { useState } from "react";

import {
  readShortcutsEnabled,
  saveShortcutsEnabled,
} from "../../lib/client/shortcuts";
import { closeDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Dialog from "../common/Dialog";

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "n", action: "New Tweet" },
  { keys: "/", action: "Search" },
  { keys: "?", action: "Show keyboard shortcuts" },
  { keys: "Ctrl / ⌘ + Enter", action: "Send Tweet or reply" },
  { keys: "Esc", action: "Close dialog or menu" },
];

/** Dialog content mounts only while open, so this reads the stored choice fresh. */
function ShortcutsToggle() {
  const [enabled, setEnabled] = useState(readShortcutsEnabled);

  return (
    <label className="mb-2 flex cursor-pointer items-center justify-between gap-4 rounded-md border border-line p-3 text-[15px]">
      <span>
        <span className="block font-bold">Single-key shortcuts</span>
        <span className="block text-[13px] text-muted">
          Turn off if you use speech input or press keys by accident.
        </span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={enabled}
        onChange={(event) => {
          setEnabled(event.target.checked);
          saveShortcutsEnabled(event.target.checked);
        }}
        className="h-5 w-5 shrink-0 accent-[#1570c2]"
      />
    </label>
  );
}

export default function ShortcutsDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((state) => state.ui.dialog === "shortcuts");

  return (
    <Dialog
      open={open}
      onClose={() => dispatch(closeDialog())}
      title="Keyboard shortcuts"
    >
      <ShortcutsToggle />
      <dl className="divide-y divide-line">
        {SHORTCUTS.map((shortcut) => (
          <div
            key={shortcut.keys}
            className="flex items-center justify-between py-3 text-[15px]"
          >
            <dt>{shortcut.action}</dt>
            <dd>
              <kbd className="rounded border border-line bg-subtle px-2 py-0.5 font-sans text-[13px]">
                {shortcut.keys}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
