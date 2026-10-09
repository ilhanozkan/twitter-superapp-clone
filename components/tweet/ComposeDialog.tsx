import { closeCompose } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Dialog from "../common/Dialog";
import Composer from "./Composer";

/** The composer opened from the sidebar's Tweet button, or prefilled by a feature (openCompose). */
export default function ComposeDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((state) => state.ui.composeOpen);
  const prefill = useAppSelector((state) => state.ui.composePrefill);
  const close = () => dispatch(closeCompose());

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Compose Tweet"
      hideTitle
      className="mt-[5vh] self-start"
    >
      <div className="-mx-4 -mb-4">
        {/* Mounted per opening (Dialog renders content only while open), so
            the prefill is read fresh each time. */}
        <Composer autoFocus prefill={prefill} onPosted={close} />
      </div>
    </Dialog>
  );
}
