import { IconType } from "react-icons/lib";

export interface INavItem {
  icon: IconType;
  activeIcon: IconType;
  name: string;
  link: string;
  active: boolean;
}
