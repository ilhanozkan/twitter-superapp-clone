import { useState, FormEvent, SetStateAction, Dispatch } from "react";

import { ITweet, TweetBody } from "../types/Tweet";
import fetchTweets from "../utils/fetchTweets";

interface Props {
  setFeed: Dispatch<SetStateAction<ITweet[]>>;
}

const CreateTweet = ({ setFeed }: Props) => {
  const [tweetMsg, setTweetMsg] = useState("");

  const postTweet = async () => {
    const tweetInfo: TweetBody = {
      tweet: tweetMsg,
      username: "illlhanozkan",
      fullname: "Ilhan Ozkan",
      userImage:
        "https://pbs.twimg.com/profile_images/1585737676489166850/QJYayPIS_normal.jpg",
      tweetImage:
        "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/640px-Cat03.jpg",
    };

    const reqOptions = {
      body: JSON.stringify(tweetInfo),
      method: "POST",
    };

    const result = await fetch(`/api/addTweet`, reqOptions);
    const json = await result.json();
    const newTweets = await fetchTweets();

    setFeed(newTweets);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    postTweet();
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="What's happening?"
        className="h-24 w-full outline-none"
        onChange={(e) => setTweetMsg(e.target.value)}
      />
      <button
        type="submit"
        disabled={!tweetMsg}
        className="mb-2 flex items-center rounded-full bg-primary transition-colors duration-200 hover:bg-primaryDark disabled:opacity-40"
      >
        <p className="text-md px-4 py-1.5 font-bold text-white">Tweet</p>
      </button>
    </form>
  );
};

export default CreateTweet;
