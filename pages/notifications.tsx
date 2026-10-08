import Head from "next/head";

import EmptyState from "../components/common/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import NotificationItem from "../components/NotificationItem";
import { withPageState } from "../lib/server/pageState";
import { useAppSelector } from "../store";
import { INotification } from "../types/Notification";

export default function Notifications({
  notifications,
}: {
  notifications: INotification[];
}) {
  const viewer = useAppSelector((state) => state.session.viewer);

  return (
    <>
      <Head>
        <title>Notifications / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Notifications" />
      {notifications.length === 0 || !viewer ? (
        <EmptyState title="Nothing to see here — yet">
          When someone likes, Retweets or replies to one of your Tweets, you’ll
          see it here.
        </EmptyState>
      ) : (
        <section aria-label="Notifications">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              viewerUsername={viewer.username}
            />
          ))}
        </section>
      )}
    </>
  );
}

export const getServerSideProps = withPageState<{
  notifications: INotification[];
}>(async ({ repo, viewer }) => ({
  props: { notifications: await repo.listNotifications(viewer.username) },
}));
