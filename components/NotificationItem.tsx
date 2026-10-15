import Link from "next/link";

import { useAppSelector } from "../store";
import { INotification } from "../types/Notification";
import Avatar from "./common/Avatar";
import RelativeTime from "./common/RelativeTime";
import { viewNotification } from "./notifications/registry";

/**
 * One notification: the type's icon in its tone, the actor, a sentence that
 * is the card's single link (and its accessible name), the time, and a quote
 * when there is one. Each feature renders its own types (registry.ts).
 */
export default function NotificationItem({
  notification,
  viewerUsername,
}: {
  notification: INotification;
  viewerUsername: string;
}) {
  const features = useAppSelector((state) => state.session.features);
  const view = viewNotification(notification, {
    viewer: viewerUsername,
    features,
  });
  const Icon = view.icon;
  const name = notification.actor.fullname;
  const named = view.text.startsWith(name);

  return (
    <article className="relative flex gap-3 border-b border-line px-4 py-3 transition-colors duration-200 hover:bg-fg/[0.03]">
      <Icon
        aria-hidden="true"
        className={`mt-1 w-10 shrink-0 text-[28px] ${view.tone}`}
      />
      <div className="min-w-0 flex-1">
        <Avatar user={notification.actor} size={32} />
        <p className="mt-2 text-[15px] [overflow-wrap:anywhere]">
          <Link href={view.href} className="after:absolute after:inset-0">
            {named ? (
              <>
                <strong>{name}</strong>
                {view.text.slice(name.length)}
              </>
            ) : (
              view.text
            )}
          </Link>
          <span className="text-muted">
            {" · "}
            <RelativeTime iso={notification.createdAt} />
          </span>
        </p>
        {/* Plain text: the whole card is one link. */}
        {view.body && (
          <p
            className={`mt-1 line-clamp-3 whitespace-pre-wrap break-words text-[15px] ${
              view.emphasizeBody ? "" : "text-muted"
            }`}
          >
            {view.body}
          </p>
        )}
      </div>
    </article>
  );
}
