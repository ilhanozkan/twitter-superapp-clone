import { RiCarLine } from "react-icons/ri";

import { NotificationRenderers } from "../notifications/types";

/**
 * Slot (§12.3): ride notifications (§13). "Completed" is derived once the
 * drop-off time has passed; the card leads to the ride, where the rider
 * can tip the driver or book again.
 */
export const rideNotificationRenderers: NotificationRenderers = {
  ride: (notification) => ({
    icon: RiCarLine,
    tone: notification.event === "completed" ? "text-success" : "text-muted",
    text:
      notification.event === "completed"
        ? `Your ride to ${notification.destination} is complete`
        : `Your ride to ${notification.destination} was cancelled`,
    href: `/rides/${encodeURIComponent(notification.rideId)}`,
    body: `Driver: ${notification.actor.fullname}`,
  }),
};
