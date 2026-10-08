import Head from "next/head";

import { ButtonLink } from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";
import PageHeader from "../components/layout/PageHeader";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>Page not found / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Page not found" back />
      <EmptyState
        title="Hmm… this page doesn’t exist."
        action={
          <ButtonLink href="/explore" size="lg">
            Search
          </ButtonLink>
        }
      >
        Try searching for something else.
      </EmptyState>
    </>
  );
}
