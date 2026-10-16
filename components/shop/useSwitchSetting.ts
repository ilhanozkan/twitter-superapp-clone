import { useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch } from "../../store";

/**
 * A switch that saves on the server. It moves at once (nothing here moves
 * money), settles on what the server confirmed, and moves back with a toast
 * when saving fails.
 */
export function useSwitchSetting(
  initial: boolean,
  save: (value: boolean) => Promise<boolean>
) {
  const dispatch = useAppDispatch();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  const change = async (next: boolean) => {
    setBusy(true);
    setValue(next);
    try {
      setValue(await save(next));
    } catch (reason) {
      setValue(!next);
      dispatch(showToast({ message: errorMessage(reason), tone: "error" }));
    } finally {
      setBusy(false);
    }
  };

  return { value, busy, change };
}
