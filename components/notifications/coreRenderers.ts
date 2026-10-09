import { AiFillHeart } from "react-icons/ai";
import { FaRetweet } from "react-icons/fa";
import { RiChat1Fill } from "react-icons/ri";

import { statusPath } from "../tweet/paths";
import { NotificationRenderers } from "./types";

// Notifications about the viewer's own Tweets link to them, so the path
// uses the viewer as the author.
const ownTweet = (id: string, viewer: string) =>
  statusPath({ id, author: { username: viewer, fullname: "", image: null } });

export const coreNotificationRenderers: NotificationRenderers = {
  like: (notification, { viewer }) => ({
    icon: AiFillHeart,
    tone: "text-like",
    text: `${notification.actor.fullname} liked your Tweet`,
    href: ownTweet(notification.tweet.id, viewer),
    body: notification.tweet.text,
  }),
  retweet: (notification, { viewer }) => ({
    icon: FaRetweet,
    tone: "text-retweet",
    text: `${notification.actor.fullname} Retweeted your Tweet`,
    href: ownTweet(notification.tweet.id, viewer),
    body: notification.tweet.text,
  }),
  reply: (notification, { viewer }) => ({
    icon: RiChat1Fill,
    tone: "text-primary",
    text: `${notification.actor.fullname} replied to your Tweet`,
    href: ownTweet(notification.tweet.id, viewer),
    body: notification.reply.text,
    emphasizeBody: true,
  }),
};
