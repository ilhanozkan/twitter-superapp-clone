import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect } from "react";
import { useDispatch } from "react-redux";

import Sidebar from "../components/sidebar";
import Feed from "../components/Feed";
import RightBar from "../components/RightBar";
import { MAX_PAGE_SIZE } from "../lib/constants";
import { getRepository } from "../lib/db";
import { ITweetsData } from "../types/Tweet";
import { setFeed } from "../slices/feedSlice";

const Home = ({ tweets }: ITweetsData) => {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setFeed(tweets));
  });

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
        <RightBar />
      </main>
    </div>
  );
};

export default Home;

export const getServerSideProps: GetServerSideProps<ITweetsData> = async () => {
  const { items } = await getRepository().listTweets({ limit: MAX_PAGE_SIZE });

  return { props: { tweets: items } };
};
