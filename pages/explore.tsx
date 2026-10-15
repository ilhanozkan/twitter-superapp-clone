import Head from "next/head";

import EmptyState from "../components/common/EmptyState";
import AccountMenu from "../components/layout/AccountMenu";
import SearchForm from "../components/layout/SearchForm";
import TrendsList from "../components/layout/TrendsList";
import { useStickyHeader } from "../components/layout/useStickyHeader";
import LiveActivityBanner from "../components/superapp/LiveActivityBanner";
import Timeline from "../components/tweet/Timeline";
import { timelineState, withPageState } from "../lib/server/pageState";
import { timelines } from "../lib/timelines";
import { useAppSelector } from "../store";

const MAX_QUERY_LENGTH = 100;

export default function Explore({ query }: { query: string }) {
  const trends = useAppSelector((state) => state.trends.items);
  const search = query ? timelines.search(query) : null;
  const header = useStickyHeader<HTMLDivElement>();

  return (
    <>
      <Head>
        <title>
          {query
            ? `${query} - Search / Twitter SuperApp`
            : "Explore / Twitter SuperApp"}
        </title>
      </Head>
      {/* Explore's header is its search box, so it carries the phone
          account menu and the live activity banner PageHeader would, and
          publishes its height the same way. */}
      <div
        ref={header}
        className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md"
      >
        <div className="flex items-center gap-6 px-4 py-1">
          <h1 className="sr-only">
            {query ? `Search results for ${query}` : "Explore"}
          </h1>
          <AccountMenu />
          <div className="min-w-0 flex-1">
            {/* Remount on a new query so the box shows it. */}
            <SearchForm key={query} initialQuery={query} />
          </div>
        </div>
        <LiveActivityBanner className="lg:hidden" />
      </div>

      {search ? (
        <Timeline
          timelineKey={search.key}
          label={`Search results for ${query}`}
          empty={
            <EmptyState title={`No results for "${query}"`}>
              Try searching for something else, or check the spelling.
            </EmptyState>
          }
        />
      ) : (
        <section aria-labelledby="explore-trends">
          <h2 id="explore-trends" className="px-4 py-3 text-xl font-extrabold">
            Trends for you
          </h2>
          {trends.length > 0 ? (
            <TrendsList trends={trends} />
          ) : (
            <p className="px-4 pb-4 text-[15px] text-muted">
              Nothing is trending yet. Use #hashtags in your Tweets to start a
              trend.
            </p>
          )}
        </section>
      )}
    </>
  );
}

export const getServerSideProps = withPageState<{ query: string }>(
  async ({ ctx, repo, viewer }) => {
    const raw = ctx.query.q;
    const query =
      typeof raw === "string" ? raw.trim().slice(0, MAX_QUERY_LENGTH) : "";
    if (!query) return { props: { query: "" } };

    const search = timelines.search(query);
    const page = await repo.listTweets({
      search: query,
      viewer: viewer.username,
    });
    return {
      props: { query },
      state: timelineState(search.key, search.query, page),
    };
  }
);
