import {
  HiOutlineCodeBracket,
  HiOutlineCommandLine,
  HiOutlinePaintBrush,
} from "react-icons/hi2";

import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch } from "../../store";
import { MenuItem } from "../common/Menu";

export const REPOSITORY_URL =
  "https://github.com/ilhanozkan/twitter-superapp-clone";

/** Settings and links in the sidebar's More menu and the phone header menu. */
export function useMoreMenuItems(): MenuItem[] {
  const dispatch = useAppDispatch();
  return [
    {
      label: "Display",
      icon: <HiOutlinePaintBrush />,
      onSelect: () => dispatch(openDialog("display")),
    },
    {
      label: "Keyboard shortcuts",
      icon: <HiOutlineCommandLine />,
      onSelect: () => dispatch(openDialog("shortcuts")),
    },
    {
      label: "Source code",
      icon: <HiOutlineCodeBracket />,
      onSelect: () =>
        window.open(REPOSITORY_URL, "_blank", "noopener,noreferrer"),
    },
  ];
}
