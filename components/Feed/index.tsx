import { useState } from "react";

import { ITweet, ITweetsData } from "../../types/Tweet";
import Tweet from "./tweet";

const Feed = ({ tweets }: ITweetsData) => {
  const [tweetMsg, setTweetMsg] = useState("");

  return (
    <div className="border-r border-gray-100">
      <input
        type="text"
        placeholder="What's happening?"
        className="h-24 w-full outline-none"
        onChange={(e) => setTweetMsg(e.target.value)}
      />
      <button
        disabled={!tweetMsg}
        className="mb-2 flex items-center rounded-full bg-primary transition-colors duration-200 hover:bg-primaryDark disabled:opacity-40"
      >
        <p className="text-md px-4 py-1.5 font-bold text-white">Tweet</p>
      </button>

      {tweets.map((tweet: ITweet) => (
        <Tweet key={tweet._id} tweet={tweet} />
      ))}
    </div>
  );
};

export default Feed;
