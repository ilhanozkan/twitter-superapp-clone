import { useRouter } from "next/router";

import { useAppSelector } from "../../store";
import { ILiveActivity } from "../../types/Superapp";

/** A URL's path, without its query or hash: "/rides/r1?x=1" → "/rides/r1". */
export const pathOf = (url: string) => url.split(/[?#]/)[0];

/** Live activity to show here: an item is hidden on its own page. */
export function useLiveActivity(): ILiveActivity[] {
  const router = useRouter();
  const live = useAppSelector((state) => state.activity.live);
  const path = pathOf(router.asPath);
  return live.filter((item) => pathOf(item.href) !== path);
}
