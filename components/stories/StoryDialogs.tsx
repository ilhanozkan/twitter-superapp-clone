import { useEffect } from "react";

import { restoreSeen } from "../../slices/storiesSlice";
import { closeDialog, ModalDialogName } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import StoryComposerDialog from "./StoryComposerDialog";
import StoryViewerDialog from "./StoryViewerDialog";

/**
 * Slot (§12.3): the story composer and viewer (ui.dialog "storyComposer",
 * "storyViewer"; the viewer's arguments in ui.dialogArgs, see viewerArgs.ts).
 * AppShell loads it on demand (next/dynamic, no SSR), so neither is in a
 * page's first bundle.
 */
export default function StoryDialogs() {
  const dispatch = useAppDispatch();
  const on = useAppSelector((state) => state.session.features.stories);
  const dialog = useAppSelector((state) => state.ui.dialog);
  const args = useAppSelector((state) => state.ui.dialogArgs);

  // READ_ONLY: stories watched in this tab before a reload stay grey.
  useEffect(() => {
    dispatch(restoreSeen());
  }, [dispatch]);

  if (!on) return null;

  // A <dialog> reports its close after another dialog may have opened:
  // only close the one that is still ours.
  const closeIf = (name: ModalDialogName) => () => {
    if (dialog === name) dispatch(closeDialog());
  };

  return (
    <>
      <StoryComposerDialog
        open={dialog === "storyComposer"}
        onClose={closeIf("storyComposer")}
      />
      <StoryViewerDialog
        open={dialog === "storyViewer"}
        args={dialog === "storyViewer" ? args : null}
        onClose={closeIf("storyViewer")}
      />
    </>
  );
}
