import Head from "next/head";
import { useState } from "react";

import PageHeader from "../../components/layout/PageHeader";
import BalanceSummary from "../../components/superapp/BalanceSummary";
import FrozenNotice from "../../components/superapp/FrozenNotice";
import ReadOnlyNotice from "../../components/superapp/ReadOnlyNotice";
import TransferList from "../../components/superapp/TransferList";
import WalletActions from "../../components/wallet/WalletActions";
import WalletRequests from "../../components/wallet/WalletRequests";
import { errorMessage } from "../../lib/client/api";
import { walletApi } from "../../lib/client/walletApi";
import { withPageState } from "../../lib/server/pageState";
import { useAppSelector } from "../../store";
import { IPage } from "../../types/Page";
import { ITransfer } from "../../types/Wallet";

const PAGE_SIZE = 20;

/**
 * The viewer's wallet: balance, activity and the banners. The wallet lane
 * adds the action buttons, requests and dialogs through its slots.
 */
export default function Wallet({ activity }: { activity: IPage<ITransfer> }) {
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const wallet = useAppSelector((state) => state.wallet.wallet);
  const [page, setPage] = useState(activity);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMore = async () => {
    if (loading || !page.nextCursor) return;
    setLoading(true);
    setError(null);
    try {
      const next = await walletApi.listActivity({
        limit: PAGE_SIZE,
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

  return (
    <>
      <Head>
        <title>Wallet / Twitter SuperApp</title>
      </Head>
      <PageHeader
        title="Wallet"
        subtitle={viewer ? `@${viewer.username} · Demo credits` : undefined}
      />
      {readOnly && <ReadOnlyNotice />}
      {wallet?.frozen && <FrozenNotice />}

      <section
        aria-labelledby="balance-heading"
        className="flex flex-col gap-4 border-b border-line px-4 py-5"
      >
        <h2 id="balance-heading" className="sr-only">
          Balance
        </h2>
        {wallet ? (
          <BalanceSummary wallet={wallet} />
        ) : (
          <p role="alert" className="text-[15px] text-muted">
            Your balance can’t be shown right now. Try again in a moment.
          </p>
        )}
        {!readOnly && <WalletActions variant="page" />}
      </section>

      <WalletRequests />

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading" className="px-4 pt-4 text-xl font-extrabold">
          Activity
        </h2>
        {viewer && (
          <TransferList
            transfers={page.items}
            viewer={viewer.username}
            hasMore={!!page.nextCursor}
            loading={loading}
            error={error}
            onLoadMore={loadMore}
            empty={
              <p className="px-4 py-8 text-[15px] text-muted">
                No activity yet. Add demo credits, then tip a Tweet or pay a
                friend.
              </p>
            }
          />
        )}
      </section>

      <footer className="border-t border-line px-4 py-6 text-[13px] text-muted">
        Demo credits have no cash value and can’t be bought, withdrawn or
        exchanged.
      </footer>
    </>
  );
}

export const getServerSideProps = withPageState<{
  activity: IPage<ITransfer>;
}>(
  async ({ repo, viewer }) => ({
    props: {
      activity: await repo.wallet.listActivity(viewer.username, {
        limit: PAGE_SIZE,
      }),
    },
  }),
  { feature: "wallet" }
);
