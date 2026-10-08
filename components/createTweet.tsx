import { useState, FormEvent } from "react";
import { useDispatch } from "react-redux";

import fetchTweets from "../utils/fetchTweets";
import { setFeed } from "../slices/feedSlice";

const CreateTweet = () => {
  const [tweetMsg, setTweetMsg] = useState("");
  const dispatch = useDispatch();

  const postTweet = async () => {
    // The server stamps the author; only the content is sent.
    const result = await fetch("/api/tweets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: tweetMsg }),
    });
    if (!result.ok) return;

    const newTweets = await fetchTweets();
    dispatch(setFeed(newTweets));
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    postTweet();
  };

  return (
    <form onSubmit={handleSubmit} className="px-4">
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
