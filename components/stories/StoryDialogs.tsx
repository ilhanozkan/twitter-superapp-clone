import { ReactNode } from "react";

/**
 * Slot (§12.3): the stories lane's global dialogs, the story composer and
 * viewer (ui.dialog "storyComposer", "storyViewer"; arguments in
 * ui.dialogArgs).
 * AppShell loads it on demand (next/dynamic, no SSR). This stub renders
 * nothing.
 */
const StoryDialogs: () => ReactNode = () => null;
export default StoryDialogs;
