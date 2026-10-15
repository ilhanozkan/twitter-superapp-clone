import Link from "next/link";

import { pluralize } from "../../lib/format";
import { ITrend } from "../../types/Trend";

/** Hashtags ranked by use; each opens a search for it. */
export default function TrendsList({ trends }: { trends: ITrend[] }) {
  return (
    <ol>
      {trends.map((trend, index) => (
        <li key={trend.tag}>
          <Link
            href={`/explore?q=${encodeURIComponent(trend.tag)}`}
            // Inset focus ring: the rounded panel clips anything outside.
            className="block px-4 py-3 outline-offset-[-2px] transition-colors duration-200 hover:bg-fg/[0.03]"
          >
            <span className="block text-[13px] text-muted">
              {index + 1} · Trending
            </span>
            <span className="block truncate text-[15px] font-bold">
              {trend.tag}
            </span>
            <span className="block text-[13px] text-muted">
              {pluralize(trend.tweetCount, "Tweet")}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
