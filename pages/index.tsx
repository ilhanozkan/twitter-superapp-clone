import type { NextPage } from "next";
import Head from "next/head";

import Sidebar from "../components/sidebar";
import Feed from "../components/feed";

const Home: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Twitter SuperApp</title>
        <meta
          name="description"
          content="Twitter Clone but Twitter as a SuperApp"
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="flex justify-center">
        <Sidebar />
        <Feed />
      </main>
    </div>
  );
};

export default Home;
