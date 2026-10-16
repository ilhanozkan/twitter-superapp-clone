import Head from "next/head";

import PageHeader from "../../../components/layout/PageHeader";
import { statusPath } from "../../../components/tweet/paths";
import Receipt, { ReceiptProps } from "../../../components/wallet/Receipt";
import { KEY_PATTERN } from "../../../lib/db/sanity/ids";
import { withPageState } from "../../../lib/server/pageState";
import { canViewTransfer } from "../../../lib/superapp/policy/wallet";

/** A receipt: only its two parties can open it; anyone else gets a 404. */
export default function ReceiptPage(props: ReceiptProps) {
  return (
    <>
      <Head>
        <title>Receipt / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Receipt" subtitle="Demo credits" back />
      <Receipt {...props} />
    </>
  );
}

export const getServerSideProps = withPageState<ReceiptProps>(
  async ({ ctx, repo, viewer }) => {
    const id = ctx.params?.id;
    if (typeof id !== "string" || !KEY_PATTERN.test(id)) {
      return { notFound: true };
    }

    // Not a party is the same as missing: ids reveal nothing.
    const transfer = await repo.wallet.getTransfer(id);
    if (!transfer || !canViewTransfer(viewer.username, transfer)) {
      return { notFound: true };
    }

    let tweetHref: string | null = null;
    if (transfer.context?.type === "tweet") {
      const tweet = await repo.getTweet(transfer.context.id, viewer.username);
      tweetHref = tweet ? statusPath(tweet) : null;
    }

    return {
      props: { transfer, tweetHref, serverNow: new Date().toISOString() },
    };
  },
  { feature: "wallet" }
);
