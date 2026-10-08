import Head from "next/head";

import EmptyState from "../../components/common/EmptyState";
import PageHeader from "../../components/layout/PageHeader";
import { USERNAME_PATTERN } from "../../lib/constants";
import { withPageState } from "../../lib/server/pageState";
import { useAppSelector } from "../../store";
import { IUserProfile } from "../../types/User";

export default function Lists({ user }: { user: IUserProfile }) {
  const viewer = useAppSelector((state) => state.session.viewer);
  const isMe = viewer?.username.toLowerCase() === user.username.toLowerCase();

  return (
    <>
      <Head>
        <title>{`Lists created by @${user.username} / Twitter SuperApp`}</title>
      </Head>
      <PageHeader title="Lists" subtitle={`@${user.username}`} back />
      <EmptyState
        title={
          isMe
            ? "You haven’t created any Lists yet"
            : `@${user.username} hasn’t created any Lists`
        }
      >
        Lists are curated timelines of accounts. They are on the roadmap; when
        they ship, they’ll show up here.
      </EmptyState>
    </>
  );
}

export const getServerSideProps = withPageState<{ user: IUserProfile }>(
  async ({ ctx, repo }) => {
    const username = ctx.params?.username;
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) {
      return { notFound: true };
    }

    const user = await repo.getUser(username);
    if (!user) return { notFound: true };
    if (user.username !== username) {
      return {
        redirect: {
          destination: `/${user.username}/lists`,
          permanent: false,
        },
      };
    }
    return { props: { user } };
  }
);
