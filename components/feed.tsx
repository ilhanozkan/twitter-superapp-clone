import { useState } from "react";

const Feed = () => {
  const [tweetMsg, setTweetMsg] = useState("");

  return (
    <div>
      <input
        type="text"
        placeholder="What's happening?"
        className="h-24 w-full outline-none"
        onChange={(e) => setTweetMsg(e.target.value)}
      />
      <button
        disabled={!tweetMsg}
        className="flex items-center rounded-full bg-primary transition-colors duration-200 hover:bg-primaryDark disabled:opacity-40"
      >
        <p className="text-md px-4 py-1.5 font-bold text-white">Tweet</p>
      </button>
    </div>
  );
};

export default Feed;
