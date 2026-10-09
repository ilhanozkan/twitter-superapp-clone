import { HiOutlineBell } from "react-icons/hi2";

import { INotification } from "../../types/Notification";
import { orderNotificationRenderers } from "../orders/notificationRenderers";
import { rideNotificationRenderers } from "../rides/notificationRenderers";
import { statusPath } from "../tweet/paths";
import { coreNotificationRenderers } from "./coreRenderers";
import {
  NotificationContext,
  NotificationRenderer,
  NotificationRenderers,
  NotificationView,
} from "./types";
import { receiptPath, walletNotificationRenderers } from "./walletRenderers";

/** Every notification type's renderer: core, wallet, then each lane's. */
export const notificationRenderers: NotificationRenderers = {
  ...coreNotificationRenderers,
  ...walletNotificationRenderers,
  ...orderNotificationRenderers,
  ...rideNotificationRenderers,
};

/** Where a notification leads (§13), for types without a renderer. */
export function fallbackHref(
  notification: INotification,
  viewer: string
): string {
  switch (notification.type) {
    case "like":
    case "retweet":
    case "reply":
      return statusPath({
        id: notification.tweet.id,
        author: { username: viewer, fullname: "", image: null },
      });
    case "tip":
    case "payment":
      return receiptPath(notification.transferId);
    case "payment_request":
    case "request_paid":
    case "request_declined":
      return "/wallet";
    case "order":
      return notification.event === "received"
        ? "/business"
        : `/orders/${encodeURIComponent(notification.orderId)}`;
    case "ride":
      return `/rides/${encodeURIComponent(notification.rideId)}`;
  }
}

/**
 * The card for a notification: its type's renderer, or the fallback (the
 * actor's name with a link to where it leads) while no lane renders it.
 */
export function viewNotification(
  notification: INotification,
  context: NotificationContext,
  renderers: NotificationRenderers = notificationRenderers
): NotificationView {
  const render = renderers[notification.type] as
    NotificationRenderer<typeof notification.type> | undefined;
  if (render) return render(notification as never, context);
  return {
    icon: HiOutlineBell,
    tone: "text-primary",
    text: notification.actor.fullname,
    href: fallbackHref(notification, context.viewer),
  };
}
