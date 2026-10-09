import {
  HiOutlineBanknotes,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
} from "react-icons/hi2";
import { RiCoinFill, RiHandCoinLine } from "react-icons/ri";

import { formatCredits } from "../../lib/superapp/money";
import { statusPath } from "../tweet/paths";
import { NotificationContext, NotificationRenderers } from "./types";

export const receiptPath = (transferId: string) =>
  `/wallet/transactions/${encodeURIComponent(transferId)}`;

/** The conversation, while Messages is on to show it. */
const conversationPath = (
  conversationId: string | null,
  { features }: NotificationContext
) =>
  conversationId && features.messages
    ? `/messages/${encodeURIComponent(conversationId)}`
    : null;

const quoted = (note: string | null) => (note ? ` · “${note}”` : "");

export const walletNotificationRenderers: NotificationRenderers = {
  tip: (notification, { viewer }) => ({
    icon: RiCoinFill,
    tone: "text-tip",
    text: `${notification.actor.fullname} tipped your Tweet ${formatCredits(notification.amount)}`,
    // The receipt once the Tweet is gone.
    href: notification.tweet
      ? statusPath({
          id: notification.tweet.id,
          author: { username: viewer, fullname: "", image: null },
        })
      : receiptPath(notification.transferId),
    body: notification.tweet?.text ?? "Tweet deleted",
  }),
  payment: (notification, context) => ({
    icon: HiOutlineBanknotes,
    tone: "text-success",
    text: `${notification.actor.fullname} sent you ${formatCredits(notification.amount)}${quoted(notification.note)}`,
    href:
      conversationPath(notification.conversationId, context) ??
      receiptPath(notification.transferId),
  }),
  payment_request: (notification, context) => ({
    icon: RiHandCoinLine,
    tone: "text-tip",
    text: `${notification.actor.fullname} requested ${formatCredits(notification.amount)}${quoted(notification.note)}`,
    href:
      conversationPath(notification.conversationId, context) ??
      "/wallet?tab=requests",
  }),
  request_paid: (notification) => ({
    icon: HiOutlineCheckCircle,
    tone: "text-success",
    text: `${notification.actor.fullname} paid your request for ${formatCredits(notification.amount)}`,
    href: notification.transferId
      ? receiptPath(notification.transferId)
      : "/wallet",
  }),
  request_declined: (notification) => ({
    icon: HiOutlineXCircle,
    tone: "text-muted",
    text: `${notification.actor.fullname} declined your request for ${formatCredits(notification.amount)}`,
    href: "/wallet?tab=requests",
  }),
};
