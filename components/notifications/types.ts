import { IconType } from "react-icons";

import { INotification, NotificationType } from "../../types/Notification";
import { IFeatures } from "../../types/Superapp";

export interface NotificationContext {
  /** The signed-in user, whose notifications these are. */
  viewer: string;
  features: IFeatures;
}

/** What a notification card shows; the whole card is one link. */
export interface NotificationView {
  icon: IconType;
  /** A text colour class for the icon, e.g. "text-tip". */
  tone: string;
  /** The card's sentence and the link's accessible name: "Sarah Chen tipped your Tweet 2.00 credits". */
  text: string;
  href: string;
  /** A quote under the sentence (the Tweet, the reply). */
  body?: string | null;
  /** Show the body in full contrast (a reply) rather than muted (the Tweet replied to). */
  emphasizeBody?: boolean;
}

/** The notification of one type (like/retweet share a union member, so not Extract). */
export type NotificationOf<T extends NotificationType> = INotification & {
  type: T;
};

export type NotificationRenderer<T extends NotificationType> = (
  notification: NotificationOf<T>,
  context: NotificationContext
) => NotificationView;

/** Renderers by type. Each feature lane ships its own map (§12.3). */
export type NotificationRenderers = {
  [T in NotificationType]?: NotificationRenderer<T>;
};
