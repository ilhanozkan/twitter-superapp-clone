import { useCallback } from "react";
import { useStore } from "react-redux";

import { closeDialog, ModalDialogName } from "../../slices/uiSlice";
import { AppStore, useAppDispatch, useAppSelector } from "../../store";

const useAppStore = useStore.withTypes<AppStore>();

/**
 * One of the global dialogs: whether it is open, its arguments, and a close
 * that only closes it while it is still the open one. Switching dialogs
 * (Send's "Add credits" opens Add credits) closes the old <dialog>, whose
 * close event arrives after the new one is open and must not close that.
 */
export function useWalletDialog(name: ModalDialogName) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const open = useAppSelector((state) => state.ui.dialog === name);
  const args = useAppSelector((state) =>
    state.ui.dialog === name ? state.ui.dialogArgs : null
  );

  const close = useCallback(() => {
    if (store.getState().ui.dialog === name) dispatch(closeDialog());
  }, [dispatch, store, name]);

  return { open, args, close };
}
