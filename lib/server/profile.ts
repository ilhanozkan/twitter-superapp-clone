import { profileState } from "../../slices/profilesSlice";
import { IUserProfile } from "../../types/User";
import { USERNAME_PATTERN } from "../constants";
import { timelines } from "../timelines";
import { timelineState, withPageState } from "./pageState";

/** getServerSideProps of a profile tab: the user plus their tweets or likes. */
export function loadProfile(tab: "tweets" | "likes") {
  return withPageState<{ user: IUserProfile }>(
    async ({ ctx, repo, viewer }) => {
      const username = ctx.params?.username;
      if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) {
        return { notFound: true };
      }

      const user = await repo.getUser(username);
      if (!user) return { notFound: true };

      // Canonical casing in the URL, like twitter.com/IlhanOzkan -> /illlhanozkan.
      if (user.username !== username) {
        const suffix = tab === "likes" ? "/likes" : "";
        return {
          redirect: {
            destination: `/${user.username}${suffix}`,
            permanent: false,
          },
        };
      }

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
        props: { user },
        state: {
          ...timelineState(spec.key, spec.query, page),
          profiles: profileState(user),
        },
      };
    }
  );
}
