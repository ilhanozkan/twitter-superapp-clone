import { useState } from "react";

import {
  readThemePreference,
  saveThemePreference,
  ThemePreference,
} from "../../lib/client/theme";
import { closeDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Dialog from "../common/Dialog";

const OPTIONS: {
  value: ThemePreference;
  label: string;
  description: string;
}[] = [
  { value: "light", label: "Light", description: "Dark text on white." },
  { value: "dark", label: "Lights out", description: "Light text on black." },
  {
    value: "system",
    label: "Automatic",
    description: "Follow your device setting.",
  },
];

/** Mounted only while the dialog is open, so it reads the stored choice fresh. */
function ThemeOptions() {
  const [preference, setPreference] =
    useState<ThemePreference>(readThemePreference);

  const choose = (value: ThemePreference) => {
    setPreference(value);
    saveThemePreference(value);
  };

  return (
    <fieldset>
      <legend className="mb-2 text-[15px] font-bold">Background</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => (
          <label
            key={option.value}
            className={`flex cursor-pointer items-start gap-3 rounded-md border-2 p-3 transition-colors ${
              preference === option.value
                ? "border-primary"
                : "border-line hover:bg-fg/5"
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={option.value}
              checked={preference === option.value}
              onChange={() => choose(option.value)}
              className="mt-1 accent-[#1570c2]"
            />
            <span>
              <span className="block text-[15px] font-bold">
                {option.label}
              </span>
              <span className="block text-[13px] text-muted">
                {option.description}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function DisplayDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((state) => state.ui.dialog === "display");

  return (
    <Dialog
      open={open}
      onClose={() => dispatch(closeDialog())}
      title="Customize your view"
    >
      <p className="mb-4 text-[15px] text-muted">
        These settings affect this browser only.
      </p>
      <ThemeOptions />
    </Dialog>
  );
}
