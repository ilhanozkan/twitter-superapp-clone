import { useRouter } from "next/router";
import {
  HiOutlineBookmark,
  HiOutlineBuildingStorefront,
  HiOutlineQueueList,
  HiOutlineUser,
  HiOutlineWallet,
} from "react-icons/hi2";

import { useAppSelector } from "../../store";
import Avatar from "../common/Avatar";
import Menu, { MenuItem } from "../common/Menu";
import { useMoreMenuItems } from "./moreMenuItems";

/** What the tab bar has no room for (the sidebar shows these from 500px). */
function useAccountMenuItems(): MenuItem[] {
  const router = useRouter();
  const session = useAppSelector((state) => state.session);
  const moreItems = useMoreMenuItems();
  const username = session.viewer?.username;
  if (!username) return moreItems;

  const items: (MenuItem | false)[] = [
    {
      label: "Profile",
      icon: <HiOutlineUser />,
      onSelect: () => router.push(`/${username}`),
    },
    session.features.wallet && {
      label: "Wallet",
      icon: <HiOutlineWallet />,
      onSelect: () => router.push("/wallet"),
    },
    {
      label: "Bookmarks",
      icon: <HiOutlineBookmark />,
      onSelect: () => router.push("/i/bookmarks"),
    },
    {
      label: "Lists",
      icon: <HiOutlineQueueList />,
      onSelect: () => router.push(`/${username}/lists`),
    },
    session.features.shop &&
      session.managedBusinesses.length > 0 && {
        label: "Business",
        icon: <HiOutlineBuildingStorefront />,
        onSelect: () => router.push("/business"),
      },
  ];
  return [...items.filter((item): item is MenuItem => !!item), ...moreItems];
}

/**
 * The phone header's avatar menu. Phones have no sidebar, so every page
 * header without a back arrow starts with it (PageHeader, Explore's search
 * bar); it is hidden from 500px, where the sidebar holds the same items.
 */
export default function AccountMenu() {
  const viewer = useAppSelector((state) => state.session.viewer);
  const items = useAccountMenuItems();
  if (!viewer) return null;

  return (
    <div className="-my-1.5 -ml-1.5 -mr-3.5 shrink-0 xs:hidden">
      <Menu
        label={`${viewer.fullname} @${viewer.username}, account menu`}
        align="left"
        triggerClassName="block rounded-full p-1.5"
        trigger={<Avatar user={viewer} size={32} />}
        items={items}
      />
    </div>
  );
}
