import type { GetServerSideProps } from "next";
import Head from "next/head";

import Sidebar from "../components/sidebar";
import Feed from "../components/Feed";
import fetchTweets from "../utils/fetchTweets";
import { ITweetsData } from "../types/Tweet";

const Home = ({ tweets }: ITweetsData) => {
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
        <Feed tweets={tweets} />
      </main>
    </div>
  );
};

export default Home;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const tweets = await fetchTweets();

  return { props: { tweets } };
};
