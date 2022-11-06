import { useState } from "react";

import { ITweet, ITweetsData } from "../../types/Tweet";
import CreateTweet from "../createTweet";
import Tweet from "./tweet";

const Feed = ({ tweets }: ITweetsData) => {
  const [feed, setFeed] = useState(tweets);

  return (
    <div className="border-r border-gray-100">
      <CreateTweet setFeed={setFeed} />

      {feed.map((tweet: ITweet) => (
        <Tweet key={tweet._id} tweet={tweet} />
      ))}
    </div>
  );
};

export default Feed;
