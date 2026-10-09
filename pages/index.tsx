import Head from "next/head";

import EmptyState from "../components/common/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import StoriesTray from "../components/stories/StoriesTray";
import Composer from "../components/tweet/Composer";
import Timeline from "../components/tweet/Timeline";
import { timelineState, withPageState } from "../lib/server/pageState";
import { timelines } from "../lib/timelines";
import { IStoryTrayItem } from "../types/Story";

const home = timelines.home();

export default function Home({ tray }: { tray: IStoryTrayItem[] }) {
  return (
    <>
      <Head>
        <title>Home / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Home" />
      <StoriesTray items={tray} />
      <div className="border-b border-line">
        <Composer />
      </div>
      <Timeline
        timelineKey={home.key}
        label="Home timeline"
        empty={
          <EmptyState title="Welcome to Twitter SuperApp!">
            This is the best place to see what’s happening. Post your first
            Tweet to get started.
          </EmptyState>
        }
      />
    </>
  );
}

export const getServerSideProps = withPageState<{ tray: IStoryTrayItem[] }>(
  async ({ repo, viewer }) => {
    const [page, tray] = await Promise.all([
      repo.listTweets({ ...home.query, viewer: viewer.username }),
      // The tray is a feature widget: if it can't load, Home still does.
      repo.features.stories
        ? repo.stories.listTray(viewer.username).catch((error: unknown) => {
            console.error(
              JSON.stringify({
                level: "error",
                message: "Reading the story tray failed",
                error: error instanceof Error ? error.message : String(error),
              })
            );
            return [];
          })
        : [],
    ]);
    return {
      props: { tray },
      state: timelineState(home.key, home.query, page),
    };
  }
);
