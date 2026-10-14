import Head from "next/head";

import PageHeader from "../../components/layout/PageHeader";
import { orderNumber } from "../../components/orders/format";
import OrderTracker from "../../components/orders/OrderTracker";
import { KEY_PATTERN } from "../../lib/db/sanity/ids";
import { withPageState } from "../../lib/server/pageState";
import { getPlace } from "../../lib/superapp/places";
import { canViewOrder } from "../../lib/superapp/policy/orders";
import { OrderEntry, ordersState } from "../../slices/ordersSlice";
import { PageShell } from "../../types/PageShell";
import { IPlace } from "../../types/Superapp";

interface OrderPageProps {
  initial: OrderEntry;
  from: IPlace | null;
  side: "buyer" | "business";
}

/** An order's tracker, for its buyer and the people who run its business. */
export default function OrderPage({ initial, from, side }: OrderPageProps) {
  const { order } = initial;
  const title = `Order ${orderNumber(order)} from ${order.business.fullname}`;
  return (
    <>
      <Head>
        <title>{`${title} / Twitter SuperApp`}</title>
      </Head>
      <PageHeader title={title} back />
      <OrderTracker key={order.id} initial={initial} from={from} side={side} />
    </>
  );
}

OrderPage.shell = { hideComposeButton: true } satisfies PageShell;

export const getServerSideProps = withPageState<OrderPageProps>(
  async ({ ctx, repo, viewer }) => {
    const id = ctx.params?.id;
    if (typeof id !== "string" || !KEY_PATTERN.test(id)) {
      return { notFound: true };
    }

    // Someone else's order is the same as a missing one: ids reveal nothing.
    const order = await repo.orders.getOrder(id);
    if (!order) return { notFound: true };
    const business = await repo.business.getBusiness(order.business.username);
    if (!canViewOrder(viewer.username, order, business)) {
      return { notFound: true };
    }

    const serverNow = new Date().toISOString();
    const side =
      order.buyer.username.toLowerCase() === viewer.username.toLowerCase()
        ? "buyer"
        : "business";
    return {
      props: {
        initial: { order, serverNow },
        from: business ? getPlace(business.placeId) : null,
        side,
      },
      state: { orders: ordersState([order], serverNow) },
    };
  },
  { feature: "orders" }
);
