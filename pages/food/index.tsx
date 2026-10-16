import Head from "next/head";

import PageHeader from "../../components/layout/PageHeader";
import FoodHub from "../../components/shop/FoodHub";
import { withPageState } from "../../lib/server/pageState";
import { IBusinessSummary } from "../../types/Shop";

/** The Food hub: every business, each card leading to its menu. */
export default function Food({ items }: { items: IBusinessSummary[] }) {
  return (
    <>
      <Head>
        <title>Food / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Food" subtitle="Delivery around Ankara · demo" />
      <FoodHub items={items} />
    </>
  );
}

export const getServerSideProps = withPageState<{ items: IBusinessSummary[] }>(
  async ({ repo }) => ({
    props: { items: await repo.shop.listBusinessSummaries() },
  }),
  { feature: "shop" }
);
