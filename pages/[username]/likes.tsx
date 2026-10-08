import Head from "next/head";

import EmptyState from "../../components/common/EmptyState";
import PageHeader from "../../components/layout/PageHeader";
import ProfileHeader from "../../components/profile/ProfileHeader";
import Timeline from "../../components/tweet/Timeline";
import { pluralize } from "../../lib/format";
import { loadProfile } from "../../lib/server/profile";
import { timelines } from "../../lib/timelines";
import { IUserProfile } from "../../types/User";

export default function ProfileLikes({ user }: { user: IUserProfile }) {
  const timeline = timelines.likes(user.username);

  return (
    <>
      <Head>
        <title>{`Tweets liked by ${user.fullname} (@${user.username}) / Twitter SuperApp`}</title>
      </Head>
      <PageHeader
        title={user.fullname}
        subtitle={pluralize(user.tweetCount, "Tweet")}
        back
      />
      <ProfileHeader user={user} tab="likes" />
      <Timeline
        timelineKey={timeline.key}
        label={`Tweets liked by ${user.fullname}`}
        empty={
          <EmptyState title={`@${user.username} hasn’t liked any Tweets`}>
            When they do, those Tweets will show up here.
          </EmptyState>
        }
      />
    </>
  );
}

export const getServerSideProps = loadProfile("likes");
