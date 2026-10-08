import Head from "next/head";

import { Button } from "../components/common/Button";
import EmptyState from "../components/common/EmptyState";
import PageHeader from "../components/layout/PageHeader";

export default function ServerError() {
  return (
    <>
      <Head>
        <title>Something went wrong / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Something went wrong" />
      <EmptyState
        title="Something went wrong."
        action={
          <Button size="lg" onClick={() => window.location.reload()}>
            Try again
          </Button>
        }
      >
        Don’t worry, it’s not you. Reload the page or come back in a moment.
      </EmptyState>
    </>
  );
}
