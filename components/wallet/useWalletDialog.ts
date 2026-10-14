import { useCallback, useLayoutEffect, useRef } from "react";

import { closeDialog, ModalDialogName } from "../../slices/uiSlice";
import { useAppSelector } from "../../store";
import { useAppStore } from "./useAppStore";

/**
 * One of the global dialogs: whether it is open, its arguments, and a close
 * that only closes it while it is still the open one. Switching dialogs
 * (Send's "Add credits" opens Add credits) closes the old <dialog>, whose
 * close event arrives after the new one is open and must not close that.
 */
export function useWalletDialog(name: ModalDialogName) {
  const store = useAppStore();
  const open = useAppSelector((state) => state.ui.dialog === name);
  const args = useAppSelector((state) =>
    state.ui.dialog === name ? state.ui.dialogArgs : null
  );

  // The store this renders with now. A navigation that brings page data
  // starts a new store, which keeps the open dialog; a close that runs once
  // a tip or top-up is confirmed (after an await) must close it there, not
  // in the store of the click, or the sheet stays open to pay again.
  const current = useRef(store);
  useLayoutEffect(() => {
    current.current = store;
  }, [store]);

  const close = useCallback(() => {
    const { getState, dispatch } = current.current;
    if (getState().ui.dialog === name) dispatch(closeDialog());
  }, [name]);

  return { open, args, close };
}
