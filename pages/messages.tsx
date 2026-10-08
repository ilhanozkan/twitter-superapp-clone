import Head from "next/head";

import { ButtonLink } from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";
import PageHeader from "../components/layout/PageHeader";
import { withPageState } from "../lib/server/pageState";

export default function Messages() {
  return (
    <>
      <Head>
        <title>Messages / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Messages" />
      <EmptyState
        title="Welcome to your inbox!"
        action={
          <ButtonLink href="/explore" size="lg">
            Explore Tweets
          </ButtonLink>
        }
      >
        Direct messages, and payments over chat, are on the SuperApp roadmap.
        Until they arrive, reply to Tweets to keep the conversation going.
      </EmptyState>
    </>
  );
}

export const getServerSideProps = withPageState();
