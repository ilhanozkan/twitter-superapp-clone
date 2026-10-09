import { useRouter } from "next/router";

import { useAppSelector } from "../../store";
import { ILiveActivity } from "../../types/Superapp";

/** Live activity to show here: an item is hidden on its own page. */
export function useLiveActivity(): ILiveActivity[] {
  const router = useRouter();
  const live = useAppSelector((state) => state.activity.live);
  const path = router.asPath.split(/[?#]/)[0];
  return live.filter((item) => item.href.split(/[?#]/)[0] !== path);
}
