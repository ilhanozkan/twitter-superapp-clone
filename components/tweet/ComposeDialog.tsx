import { closeCompose } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import Dialog from "../common/Dialog";
import Composer from "./Composer";

/** The composer opened from the sidebar's Tweet button. */
export default function ComposeDialog() {
  const dispatch = useAppDispatch();
  const open = useAppSelector((state) => state.ui.composeOpen);
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
        <Composer autoFocus onPosted={close} />
      </div>
    </Dialog>
  );
}
