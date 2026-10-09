import Head from "next/head";
import { useEffect } from "react";

import EmptyState from "../components/common/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import NotificationItem from "../components/NotificationItem";
import { useServerClock } from "../lib/client/useServerClock";
import { withPageState } from "../lib/server/pageState";
import { notificationsSeen } from "../slices/activitySlice";
import { useAppDispatch, useAppSelector } from "../store";
import { INotification } from "../types/Notification";

export default function Notifications({
  notifications,
}: {
  notifications: INotification[];
}) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const serverNow = useAppSelector((state) => state.activity.serverNow);
  const clock = useServerClock(serverNow);

  // Opening Notifications clears the bell on this device. The time is the
  // server's, like the notifications' own, so a skewed clock can't hide any.
  useEffect(() => {
    dispatch(notificationsSeen(clock.now().toISOString()));
  }, [dispatch, clock, notifications]);

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
