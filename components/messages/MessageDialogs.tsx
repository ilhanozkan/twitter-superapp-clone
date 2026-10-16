import { ReactNode } from "react";

import { closeDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import NewMessageDialog from "./NewMessageDialog";

/**
 * Slot (§12.3): the messages lane's global dialogs, loaded on demand by
 * AppShell. New message (ui.dialog "newMessage"; `dialogArgs.tweetId`
 * shares that Tweet instead).
 */
const MessageDialogs: () => ReactNode = () => {
  const dispatch = useAppDispatch();
  const on = useAppSelector((state) => state.session.features.messages);
  const dialog = useAppSelector((state) => state.ui.dialog);
  const args = useAppSelector((state) => state.ui.dialogArgs);
  if (!on) return null;

  return (
    <NewMessageDialog
      open={dialog === "newMessage"}
      tweetId={dialog === "newMessage" ? (args?.tweetId ?? null) : null}
      onClose={() => dispatch(closeDialog())}
    />
  );
};
export default MessageDialogs;
