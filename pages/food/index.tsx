import Head from "next/head";
import Link from "next/link";
import { HiOutlineReceiptPercent } from "react-icons/hi2";

import PageHeader from "../../components/layout/PageHeader";
import { ORDERS_PATH } from "../../components/orders/format";
import OrderAgainRow, {
  orderAgainChoices,
} from "../../components/orders/OrderAgainRow";
import FoodHub from "../../components/shop/FoodHub";
import { withPageState } from "../../lib/server/pageState";
import { useAppSelector } from "../../store";
import { IOrder } from "../../types/Order";
import { IBusinessSummary } from "../../types/Shop";

interface FoodProps {
  items: IBusinessSummary[];
  /** "Order again": the viewer's recent deliveries (orders feature). */
  again: IOrder[];
}

/** Recent past orders read for "Order again". */
const AGAIN_READ = 20;

/** The Food hub: every business, each card leading to its menu. */
export default function Food({ items, again }: FoodProps) {
  const ordersOn = useAppSelector((state) => state.session.features.orders);
  return (
    <>
      <Head>
        <title>Food / Twitter SuperApp</title>
      </Head>
      <PageHeader
        title="Food"
        subtitle="Delivery around Ankara · demo"
        actions={
          ordersOn && (
            <Link
              href={ORDERS_PATH}
              aria-label="Your orders"
              title="Your orders"
              className="rounded-full p-2 text-xl transition-colors hover:bg-fg/10"
            >
              <HiOutlineReceiptPercent aria-hidden="true" />
            </Link>
          )
        }
      />
      {ordersOn && <OrderAgainRow orders={again} />}
      <FoodHub items={items} />
    </>
  );
}

export const getServerSideProps = withPageState<FoodProps>(
  async ({ repo, viewer }) => {
    const ordersOn = repo.featureStatus("orders") === "on";
    const [items, past] = await Promise.all([
      repo.shop.listBusinessSummaries(),
      ordersOn
        ? repo.orders.listOrders({
            buyer: viewer.username,
            state: "past",
            limit: AGAIN_READ,
          })
        : null,
    ]);
    return {
      props: { items, again: orderAgainChoices(past?.items ?? []) },
    };
  },
  { feature: "shop" }
);
