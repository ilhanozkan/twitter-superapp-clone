import Head from "next/head";

import PageHeader from "../../components/layout/PageHeader";
import OrderHistory, {
  PAST_PAGE_SIZE,
} from "../../components/orders/OrderHistory";
import { withPageState } from "../../lib/server/pageState";
import { LIMITS } from "../../lib/superapp/limits";
import { ordersState } from "../../slices/ordersSlice";
import { PageShell } from "../../types/PageShell";

interface OrdersPageProps {
  ids: string[];
  nextCursor: string | null;
  serverNow: string;
}

/** The viewer's orders: Active, then Past with Order again. */
export default function Orders(props: OrdersPageProps) {
  return (
    <>
      <Head>
        <title>Your orders / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Your orders" subtitle="Food · demo" />
      <OrderHistory {...props} />
    </>
  );
}

Orders.shell = { hideComposeButton: true } satisfies PageShell;

export const getServerSideProps = withPageState<OrdersPageProps>(
  async ({ repo, viewer }) => {
    const [active, past] = await Promise.all([
      // At most 5 are ever active (LIMITS.order.activePerBuyer).
      repo.orders.listOrders({
        buyer: viewer.username,
        state: "active",
        limit: LIMITS.order.activePerBuyer * 2,
      }),
      repo.orders.listOrders({
        buyer: viewer.username,
        state: "past",
        limit: PAST_PAGE_SIZE,
      }),
    ]);
    const serverNow = new Date().toISOString();
    const orders = [...active.items, ...past.items];
    return {
      props: {
        ids: orders.map((order) => order.id),
        nextCursor: past.nextCursor,
        serverNow,
      },
      state: { orders: ordersState(orders, serverNow) },
    };
  },
  { feature: "orders" }
);
