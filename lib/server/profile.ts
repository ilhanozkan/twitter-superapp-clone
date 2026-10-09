import { profileState } from "../../slices/profilesSlice";
import { IBusiness } from "../../types/Business";
import { IUserProfile } from "../../types/User";
import { USERNAME_PATTERN } from "../constants";
import type { Repository } from "../db";
import { timelines } from "../timelines";
import { timelineState, withPageState } from "./pageState";

export interface ProfilePageProps {
  user: IUserProfile;
  /** The business behind a business account (null for people). */
  business: IBusiness | null;
}

/** A business profile that can't be read leaves a plain profile, not an error page. */
async function readBusiness(
  repo: Repository,
  user: IUserProfile
): Promise<IBusiness | null> {
  if (user.accountType !== "business") return null;
  try {
    return await repo.business.getBusiness(user.username);
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: `Reading the business profile of ${user.username} failed`,
        error: error instanceof Error ? error.message : String(error),
      })
    );
    return null;
  }
}

type ProfileResult =
  | { found: ProfilePageProps }
  | { notFound: true }
  | { redirect: { destination: string; permanent: false } };

/**
 * The profile at `ctx.params.username` with its business, for any profile
 * tab (lanes' tabs too, e.g. /[username]/menu): a 404 for unknown users and
 * a redirect to the canonical casing, keeping the tab's `suffix`.
 */
export async function findProfile(
  repo: Repository,
  username: unknown,
  suffix = ""
): Promise<ProfileResult> {
  if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) {
    return { notFound: true };
  }

  const user = await repo.getUser(username);
  if (!user) return { notFound: true };

  // Canonical casing in the URL, like twitter.com/IlhanOzkan -> /illlhanozkan.
  if (user.username !== username) {
    return {
      redirect: {
        destination: `/${user.username}${suffix}`,
        permanent: false,
      },
    };
  }
  return { found: { user, business: await readBusiness(repo, user) } };
}

/** getServerSideProps of a profile tab: the user (and business) plus their tweets or likes. */
export function loadProfile(tab: "tweets" | "likes") {
  return withPageState<ProfilePageProps>(async ({ ctx, repo, viewer }) => {
    const profile = await findProfile(
      repo,
      ctx.params?.username,
      tab === "likes" ? "/likes" : ""
    );
    if (!("found" in profile)) return profile;
    const { user } = profile.found;

    const spec =
      tab === "likes"
        ? timelines.likes(user.username)
        : timelines.author(user.username);
    const page = await repo.listTweets(
      tab === "likes"
        ? { likedBy: user.username, viewer: viewer.username }
        : { author: user.username, viewer: viewer.username }
    );
    return {
      props: profile.found,
      state: {
        ...timelineState(spec.key, spec.query, page),
        profiles: profileState(user),
      },
    };
  });
}
