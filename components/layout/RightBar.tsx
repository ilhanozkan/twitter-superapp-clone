import Link from "next/link";
import { useRouter } from "next/router";

import { useAppSelector } from "../../store";
import SearchForm from "./SearchForm";
import TrendsList from "./TrendsList";

const SIDEBAR_TRENDS = 5;

export default function RightBar() {
  const router = useRouter();
  const trends = useAppSelector((state) => state.trends.items);
  // Explore has its own search box, and lists every trend when not searching.
  const onExplore = router.pathname === "/explore";
  const showTrends = !onExplore || !!router.query.q;

  return (
    <div className="flex flex-col gap-4 pb-16">
      {!onExplore && (
        <div className="sticky top-0 z-10 bg-surface py-1">
          <SearchForm />
        </div>
      )}

      {showTrends && (
        <section
          aria-labelledby="trends-heading"
          className="overflow-hidden rounded-2xl bg-subtle"
        >
          <h2 id="trends-heading" className="px-4 py-3 text-xl font-extrabold">
            Trends for you
          </h2>
          {trends.length > 0 ? (
            <>
              <TrendsList trends={trends.slice(0, SIDEBAR_TRENDS)} />
              <Link
                href="/explore"
                className="block px-4 py-4 text-[15px] text-primary transition-colors hover:bg-fg/[0.03]"
              >
                Show more
              </Link>
            </>
          ) : (
            <p className="px-4 pb-4 text-[15px] text-muted">
              Use #hashtags in your Tweets and they’ll start trending here.
            </p>
          )}
        </section>
      )}

      <footer className="px-4 text-[13px] text-muted">
        <a
          href="https://github.com/ilhanozkan/twitter-superapp-clone"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Twitter SuperApp on GitHub
        </a>
      </footer>
    </div>
  );
}
