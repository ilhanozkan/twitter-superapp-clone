import React from "react";

// Comment icon
import { RiChat1Line } from "react-icons/ri";
// Retweet icon
import { FaRetweet } from "react-icons/fa";
// Like icons
import { AiOutlineHeart, AiFillHeart } from "react-icons/ai";
// Share icon
import { HiOutlineUpload } from "react-icons/hi";

const TweetActions = () => {
  const icons = [
    { name: "Comment", icon: RiChat1Line, color: "primary" },
    { name: "Retweet", icon: FaRetweet, color: "green" },
    { name: "Like", icon: AiOutlineHeart, color: "pink" },
    { name: "Share", icon: HiOutlineUpload, color: "primary" },
  ];

  return (
    <div className="flex justify-between pr-12">
      {icons.map((icon) => (
        <button className="group mt-1 flex cursor-pointer items-center justify-center text-xl text-gray-600">
          <div
            className={`rounded-full fill-primary p-2 group-hover:bg-primary group-hover:bg-opacity-10`}
          >
            {React.createElement(icon.icon, null, null)}
          </div>
          {icon.name != "Share" && (
            <p className={`ml-3 text-sm group-hover:text-primary`}>5</p>
          )}
        </button>
      ))}
    </div>
  );
};

export default TweetActions;
