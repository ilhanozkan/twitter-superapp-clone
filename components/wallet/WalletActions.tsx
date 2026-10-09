import { IconType } from "react-icons";
import {
  HiOutlineArrowDownLeft,
  HiOutlinePaperAirplane,
  HiOutlinePlusCircle,
} from "react-icons/hi2";

import { ModalDialogName, openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";

export interface WalletActionsProps {
  /**
   * Where the buttons sit: the wallet page's balance card (Send, Request,
   * Add credits), the Services wallet card (the same three), or the right
   * column's card (Send, Add).
   */
  variant: "page" | "services" | "sidebar";
}

interface Action {
  dialog: ModalDialogName;
  label: string;
  icon: IconType;
}

const SEND: Action = {
  dialog: "send",
  label: "Send",
  icon: HiOutlinePaperAirplane,
};
const REQUEST: Action = {
  dialog: "request",
  label: "Request",
  icon: HiOutlineArrowDownLeft,
};
const TOP_UP: Action = {
  dialog: "topUp",
  label: "Add credits",
  icon: HiOutlinePlusCircle,
};

const ACTIONS: Record<WalletActionsProps["variant"], Action[]> = {
  page: [SEND, REQUEST, TOP_UP],
  services: [SEND, REQUEST, TOP_UP],
  sidebar: [SEND, { ...TOP_UP, label: "Add" }],
};

/**
 * Slot (§12.3): the wallet's action buttons, each opening its dialog; Send
 * is the primary one. On phones the page and Services show three columns
 * with the icon above the label, at least 44px tall. Hidden on a read-only
 * demo.
 */
export default function WalletActions({ variant }: WalletActionsProps) {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  if (readOnly) return null;

  const stacked = variant !== "sidebar";

  return (
    <div
      className={
        stacked
          ? "grid grid-cols-3 gap-2 xs:flex xs:flex-wrap"
          : "grid grid-cols-2 gap-2"
      }
    >
      {ACTIONS[variant].map(({ dialog, label, icon: Icon }, index) => (
        <button
          key={dialog}
          type="button"
          aria-haspopup="dialog"
          onClick={() => dispatch(openDialog(dialog))}
          className={`flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-bold transition-colors ${
            stacked
              ? "max-xs:flex-col max-xs:gap-1 max-xs:rounded-2xl max-xs:px-1 max-xs:py-2"
              : ""
          } ${
            index === 0
              ? "bg-primary-fill text-white hover:bg-primary-fill-hover"
              : "border border-line text-fg hover:bg-fg/5"
          }`}
        >
          <Icon aria-hidden="true" className="shrink-0 text-xl" />
          <span className="min-w-0 truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}
