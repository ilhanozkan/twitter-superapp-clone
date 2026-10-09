import Head from "next/head";
import { useRouter } from "next/router";

import PageHeader from "../../components/layout/PageHeader";
import BalanceSummary from "../../components/superapp/BalanceSummary";
import FrozenNotice from "../../components/superapp/FrozenNotice";
import ReadOnlyNotice from "../../components/superapp/ReadOnlyNotice";
import ActivityList, {
  ACTIVITY_PAGE_SIZE,
} from "../../components/wallet/ActivityList";
import OutgoingRequests from "../../components/wallet/OutgoingRequests";
import WalletActions from "../../components/wallet/WalletActions";
import WalletRequests from "../../components/wallet/WalletRequests";
import WalletTabs, { walletTab } from "../../components/wallet/WalletTabs";
import { withPageState } from "../../lib/server/pageState";
import { walletUiState } from "../../slices/walletUiSlice";
import { useAppSelector } from "../../store";
import { IPage } from "../../types/Page";
import { ITransfer } from "../../types/Wallet";

/**
 * The viewer's wallet: the balance with Send, Request and Add credits,
 * requests waiting for them, then Activity | Requests (`?tab=requests`).
 */
export default function Wallet({
  activity,
  serverNow,
}: {
  activity: IPage<ITransfer>;
  /** When `activity` was read, by the server's clock. */
  serverNow: string;
}) {
  const router = useRouter();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const wallet = useAppSelector((state) => state.wallet.wallet);
  const tab = walletTab(router.query.tab);

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

      <WalletTabs tab={tab} />
      {/* Both stay mounted, so switching tabs keeps the pages loaded. */}
      <section aria-labelledby="activity-heading" hidden={tab !== "activity"}>
        <h2 id="activity-heading" className="sr-only">
          Activity
        </h2>
        {/* A fresh read from the server starts the list over. */}
        <ActivityList
          key={serverNow}
          initial={activity}
          serverNow={serverNow}
        />
      </section>
      <section aria-labelledby="requests-heading" hidden={tab !== "requests"}>
        <h2 id="requests-heading" className="sr-only">
          Your requests
        </h2>
        <OutgoingRequests />
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
  serverNow: string;
}>(
  async ({ repo, viewer }) => {
    const [activity, requests] = await Promise.all([
      repo.wallet.listActivity(viewer.username, { limit: ACTIVITY_PAGE_SIZE }),
      // Failing requests show an inline alert with Retry, not an error
      // page: the balance and the activity still work.
      Promise.all([
        repo.wallet.listRequests(viewer.username, {
          role: "incoming",
          status: "pending",
        }),
        repo.wallet.listRequests(viewer.username, { role: "outgoing" }),
      ]).then(
        ([incoming, outgoing]) => ({ incoming, outgoing }),
        (error: unknown) => {
          console.error(
            JSON.stringify({
              level: "error",
              message: "Reading the wallet's payment requests failed",
              error: error instanceof Error ? error.message : String(error),
            })
          );
          return null;
        }
      ),
    ]);
    return {
      props: { activity, serverNow: new Date().toISOString() },
      state: { walletUi: walletUiState(requests) },
    };
  },
  { feature: "wallet" }
);
