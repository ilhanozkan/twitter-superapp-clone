import Head from "next/head";

import EmptyState from "../components/common/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import Composer from "../components/tweet/Composer";
import Timeline from "../components/tweet/Timeline";
import { timelineState, withPageState } from "../lib/server/pageState";
import { timelines } from "../lib/timelines";

const home = timelines.home();

export default function Home() {
  return (
    <>
      <Head>
        <title>Home / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Home" />
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

export const getServerSideProps = withPageState(async ({ repo, viewer }) => {
  const page = await repo.listTweets({
    ...home.query,
    viewer: viewer.username,
  });
  return { state: timelineState(home.key, home.query, page) };
});
