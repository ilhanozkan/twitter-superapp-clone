import { useMemo, useState } from "react";

import { errorMessage } from "../../lib/client/api";
import { walletApi } from "../../lib/client/walletApi";
import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IPage } from "../../types/Page";
import { ITransfer } from "../../types/Wallet";
import { Button } from "../common/Button";
import TransferList from "../superapp/TransferList";

export const ACTIVITY_PAGE_SIZE = 20;

const newestFirst = (a: ITransfer, b: ITransfer) =>
  b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

/**
 * The transfers made on this device since the page was read, then the
 * loaded pages, each once and newest first (the server's order).
 */
export function mergeActivity(
  created: ITransfer[],
  loaded: ITransfer[]
): ITransfer[] {
  const known = new Set(loaded.map((transfer) => transfer.id));
  const fresh = created.filter((transfer) => !known.has(transfer.id));
  return fresh.length ? [...fresh, ...loaded].sort(newestFirst) : loaded;
}

/**
 * The wallet's activity: transfers grouped by day (Today, Yesterday,
 * Oct 6), each a link to its receipt with the amount signed from the
 * viewer's side ("received"/"sent" for screen readers) and Pending or
 * Refunded chips. More pages load on scroll or with Show more; what this
 * device just sent, added or paid shows on top without a reload.
 */
export default function ActivityList({
  initial,
  serverNow,
}: {
  /** The first page, read on the server. */
  initial: IPage<ITransfer>;
  /** When it was read, by the server's clock. */
  serverNow: string;
}) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const created = useAppSelector((state) => state.walletUi.created);
  const [page, setPage] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transfers = useMemo(
    () => mergeActivity(created, page.items),
    [created, page.items]
  );

  const loadMore = async () => {
    if (loading || !page.nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const next = await walletApi.listActivity({
        limit: ACTIVITY_PAGE_SIZE,
        cursor: page.nextCursor,
      });
      setPage((current) => ({
        items: [...current.items, ...next.items],
        nextCursor: next.nextCursor,
      }));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  if (!viewer) return null;

  return (
    <TransferList
      transfers={transfers}
      viewer={viewer.username}
      serverNow={serverNow}
      hasMore={!!page.nextCursor}
      loading={loading}
      error={error}
      onLoadMore={loadMore}
      empty={
        <div className="flex flex-col items-start gap-4 px-4 py-8 text-[15px] text-muted">
          <p>
            No activity yet. Add demo credits, then tip a Tweet or pay a friend.
          </p>
          {!readOnly && (
            <Button
              variant="outline"
              aria-haspopup="dialog"
              onClick={() => dispatch(openDialog("topUp"))}
            >
              Add credits
            </Button>
          )}
        </div>
      }
    />
  );
}
