import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  Redirect,
} from "next";

import type { InitialState } from "../../store";
import { activityState } from "../../slices/activitySlice";
import { sessionState } from "../../slices/sessionSlice";
import { timelineFromPage } from "../../slices/timelinesSlice";
import { tweetsAdapter } from "../../slices/tweetsSlice";
import { IPage } from "../../types/Page";
import { FeatureId } from "../../types/Superapp";
import { ITweet } from "../../types/Tweet";
import { IAuthor } from "../../types/User";
import { getCurrentProfile, isReadOnly } from "../auth";
import { getRepository, Repository } from "../db";
import { loadShellState } from "./shell";

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
 * user, trends for the sidebar, the SuperApp shell: features, wallet,
 * badges and live activity) plus the page's own data, and hands it to the
 * Redux store as `initialState`. Data is read from the repository directly,
 * never through the app's own HTTP API. A page of a feature that is not
 * "on" is a 404.
 */
export function withPageState<P extends object = object>(
  load?: (context: LoadContext) => Promise<LoadResult<P>>,
  { feature }: { feature?: FeatureId } = {}
): GetServerSideProps<P & PageStateProps> {
  return async (ctx) => {
    const repo = getRepository();
    if (feature && repo.featureStatus(feature) !== "on") {
      return { notFound: true };
    }

    const [profile, trends] = await Promise.all([
      getCurrentProfile(),
      repo.listTrends(),
    ]);
    const viewer = {
      username: profile.username,
      fullname: profile.fullname,
      image: profile.image,
    };

    const [result, shell] = await Promise.all([
      load ? load({ ctx, repo, viewer }) : ({} as LoadResult<P>),
      loadShellState(repo, viewer.username),
    ]);
    if ("notFound" in result) return { notFound: true };
    if ("redirect" in result) return { redirect: result.redirect };

    return {
      props: {
        ...(result.props as P),
        initialState: {
          session: sessionState({
            viewer,
            readOnly: isReadOnly(),
            features: shell.features,
            managedBusinesses: shell.managedBusinesses,
          }),
          trends: { items: trends, loaded: true, loading: false },
          wallet: {
            wallet: shell.wallet?.wallet ?? null,
            limits: shell.wallet?.limits ?? null,
            loaded: shell.wallet !== null,
          },
          activity: activityState(shell.activity),
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
