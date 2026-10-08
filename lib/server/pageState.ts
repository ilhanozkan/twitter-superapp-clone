import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  Redirect,
} from "next";

import type { InitialState } from "../../store";
import { timelineFromPage } from "../../slices/timelinesSlice";
import { tweetsAdapter } from "../../slices/tweetsSlice";
import { IPage } from "../../types/Page";
import { ITweet } from "../../types/Tweet";
import { IAuthor } from "../../types/User";
import { getCurrentProfile, isReadOnly } from "../auth";
import { getRepository, Repository } from "../db";

export interface PageStateProps {
  initialState: InitialState;
}

interface LoadContext {
  ctx: GetServerSidePropsContext;
  repo: Repository;
  viewer: IAuthor;
}

type LoadResult<P> =
  | { props?: P; state?: InitialState }
  | { notFound: true }
  | { redirect: Redirect };

/**
 * getServerSideProps for app pages: loads what every page shows (the current
 * user, trends for the sidebar) plus the page's own data, and hands it to the
 * Redux store as `initialState`. Data is read from the repository directly,
 * never through the app's own HTTP API.
 */
export function withPageState<P extends object = object>(
  load?: (context: LoadContext) => Promise<LoadResult<P>>
): GetServerSideProps<P & PageStateProps> {
  return async (ctx) => {
    const repo = getRepository();
    const [profile, trends] = await Promise.all([
      getCurrentProfile(),
      repo.listTrends(),
    ]);
    const viewer = {
      username: profile.username,
      fullname: profile.fullname,
      image: profile.image,
    };

    const result = load ? await load({ ctx, repo, viewer }) : {};
    if ("notFound" in result) return { notFound: true };
    if ("redirect" in result) return { redirect: result.redirect };

    return {
      props: {
        ...(result.props as P),
        initialState: {
          session: { viewer, readOnly: isReadOnly() },
          trends: { items: trends, loaded: true, loading: false },
          ...result.state,
        },
      },
    };
  };
}

/** Store state for one timeline loaded on the server. */
export function timelineState(
  key: string,
  query: Record<string, string>,
  page: IPage<ITweet>
): InitialState {
  return {
    tweets: tweetsAdapter.setAll(tweetsAdapter.getInitialState(), page.items),
    timelines: { [key]: timelineFromPage(query, page) },
  };
}
