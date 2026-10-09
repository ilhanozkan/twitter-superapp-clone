import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IAuthor } from "../../types/User";
import { creditsDialogArgs } from "./dialogArgs";

/**
 * Opens Send for `person`, with the To step locked on them (a profile, a
 * Tweet's menu). Null where there is nothing to offer: the wallet is off,
 * the demo is read-only, or `person` is the viewer.
 */
export function useSendCreditsTo(person: IAuthor): (() => void) | null {
  const dispatch = useAppDispatch();
  const on = useAppSelector((state) => state.session.features.wallet);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const viewer = useAppSelector((state) => state.session.viewer?.username);

  if (!on || readOnly || !viewer) return null;
  if (viewer.toLowerCase() === person.username.toLowerCase()) return null;
  return () => dispatch(openDialog("send", creditsDialogArgs(person)));
}
