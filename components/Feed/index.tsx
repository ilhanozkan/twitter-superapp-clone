import { useSelector } from "react-redux";
import { RootState } from "../../store";

import { ITweet } from "../../types/Tweet";
import CreateTweet from "../createTweet";
import Tweet from "./tweet";

const Feed = () => {
  const feed = useSelector((state: RootState) => state.feed.value);

  return (
    <div className="border-r border-gray-100">
      <CreateTweet />

      {feed.map((tweet: ITweet) => (
        <Tweet key={tweet._id} tweet={tweet} />
      ))}
    </div>
  );
};

export default Feed;
