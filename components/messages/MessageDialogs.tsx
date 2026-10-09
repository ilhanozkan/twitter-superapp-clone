import { ReactNode } from "react";

/**
 * Slot (§12.3): the messages lane's global dialogs, New message
 * (ui.dialog "newMessage"; arguments in ui.dialogArgs).
 * AppShell loads it on demand (next/dynamic, no SSR). This stub renders
 * nothing.
 */
const MessageDialogs: () => ReactNode = () => null;
export default MessageDialogs;
