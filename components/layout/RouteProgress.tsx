import { useRouter } from "next/router";
import { useEffect, useState } from "react";

const SHOW_AFTER_MS = 150;

/**
 * A thin bar at the top while the next page's server data loads, so slow
 * navigations never look like dead clicks. Fast ones never show it.
 */
export default function RouteProgress() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const start = (url: string, { shallow }: { shallow: boolean }) => {
      if (shallow) return;
      clearTimeout(timer);
      timer = setTimeout(() => setLoading(true), SHOW_AFTER_MS);
    };
    const done = () => {
      clearTimeout(timer);
      setLoading(false);
    };

    router.events.on("routeChangeStart", start);
    router.events.on("routeChangeComplete", done);
    router.events.on("routeChangeError", done);
    return () => {
      clearTimeout(timer);
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", done);
      router.events.off("routeChangeError", done);
    };
  }, [router.events]);

  if (!loading) return null;

  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
    >
      <div className="h-full w-full animate-progress bg-brand" />
    </div>
  );
}
