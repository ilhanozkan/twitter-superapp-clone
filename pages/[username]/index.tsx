import Head from "next/head";

import EmptyState from "../../components/common/EmptyState";
import PageHeader from "../../components/layout/PageHeader";
import ProfileHeader from "../../components/profile/ProfileHeader";
import Timeline from "../../components/tweet/Timeline";
import { pluralize } from "../../lib/format";
import { loadProfile, ProfilePageProps } from "../../lib/server/profile";
import { timelines } from "../../lib/timelines";
import { selectTweetCount } from "../../slices/profilesSlice";
import { useAppSelector } from "../../store";

export default function Profile({ user, business }: ProfilePageProps) {
  const timeline = timelines.author(user.username);
  const tweetCount = useAppSelector((state) => selectTweetCount(state, user));

  return (
    <>
      <Head>
        <title>{`${user.fullname} (@${user.username}) / Twitter SuperApp`}</title>
      </Head>
      <PageHeader
        title={user.fullname}
        subtitle={pluralize(tweetCount, "Tweet")}
        back
      />
      <ProfileHeader user={user} business={business} tab="tweets" />
      <Timeline
        timelineKey={timeline.key}
        label={`Tweets by ${user.fullname}`}
        empty={
          <EmptyState title={`@${user.username} hasn’t Tweeted`}>
            When they do, their Tweets will show up here.
          </EmptyState>
        }
      />
    </>
  );
}

export const getServerSideProps = loadProfile("tweets");
