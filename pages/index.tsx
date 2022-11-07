import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useEffect } from "react";
import { useDispatch } from "react-redux";

import Sidebar from "../components/sidebar";
import Feed from "../components/Feed";
import fetchTweets from "../utils/fetchTweets";
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
      </main>
    </div>
  );
};

export default Home;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const tweets = await fetchTweets();

  return { props: { tweets } };
};
