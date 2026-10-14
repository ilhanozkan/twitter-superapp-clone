import {
  HiOutlineCheckCircle,
  HiOutlineShoppingBag,
  HiOutlineXCircle,
} from "react-icons/hi2";

import { NotificationRenderers } from "../notifications/types";
import { orderPath } from "./format";

/** Where a business's new orders are run (the Orders tab is the default). */
const BOARD_PATH = "/business";

/**
 * Slot (§12.3): "order" notifications (§13). New orders go to the people
 * who run the business and lead to its board; deliveries and cancellations
 * by the business go to the buyer and lead to the order.
 */
export const orderNotificationRenderers: NotificationRenderers = {
  order: (notification) => {
    const number = `#${notification.code}`;
    switch (notification.event) {
      case "received":
        return {
          icon: HiOutlineShoppingBag,
          tone: "text-primary",
          text: `New order ${number} from ${notification.actor.fullname} at ${notification.business}`,
          href: BOARD_PATH,
        };
      case "delivered":
        return {
          icon: HiOutlineCheckCircle,
          tone: "text-success",
          text: `Your order ${number} from ${notification.business} was delivered`,
          href: orderPath(notification.orderId),
        };
      case "cancelled":
        return {
          icon: HiOutlineXCircle,
          tone: "text-danger",
          text: `${notification.business} cancelled your order ${number}. You got a full refund.`,
          href: orderPath(notification.orderId),
        };
    }
  },
};
