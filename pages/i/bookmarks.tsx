import Head from "next/head";

import EmptyState from "../../components/common/EmptyState";
import PageHeader from "../../components/layout/PageHeader";
import Timeline from "../../components/tweet/Timeline";
import { timelineState, withPageState } from "../../lib/server/pageState";
import { timelines } from "../../lib/timelines";
import { useAppSelector } from "../../store";

const bookmarks = timelines.bookmarks();

export default function Bookmarks() {
  const viewer = useAppSelector((state) => state.session.viewer);

  return (
    <>
      <Head>
        <title>Bookmarks / Twitter SuperApp</title>
      </Head>
      <PageHeader
        title="Bookmarks"
        subtitle={viewer ? `@${viewer.username}` : undefined}
      />
      <Timeline
        timelineKey={bookmarks.key}
        label="Bookmarks"
        empty={
          <EmptyState title="Save Tweets for later">
            Bookmark Tweets to easily find them again in the future. Only you
            can see your bookmarks.
          </EmptyState>
        }
      />
    </>
  );
}

export const getServerSideProps = withPageState(async ({ repo, viewer }) => {
  const page = await repo.listTweets({
    bookmarkedBy: viewer.username,
    viewer: viewer.username,
  });
  return { state: timelineState(bookmarks.key, bookmarks.query, page) };
});
