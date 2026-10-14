import Head from "next/head";

import PageHeader from "../components/layout/PageHeader";
import Checkout from "../components/orders/Checkout";
import { withPageState } from "../lib/server/pageState";
import { PageShell } from "../types/PageShell";

/** Checkout: the cart (kept on this device) reviewed and paid. */
export default function CheckoutPage() {
  return (
    <>
      <Head>
        <title>Checkout / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Checkout" subtitle="Demo credits · Food" back />
      <Checkout />
    </>
  );
}

// Place order sits where the phone's floating compose button would.
CheckoutPage.shell = { hideComposeButton: true } satisfies PageShell;

export const getServerSideProps = withPageState(undefined, {
  feature: "orders",
});
