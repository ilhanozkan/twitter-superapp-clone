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
            className={`rounded-full p-2 ${
              icon.name == "Retweet"
                ? "group-hover:bg-green group-hover:text-green"
                : icon.name == "Like"
                ? "group-hover:bg-pink group-hover:text-pink"
                : "group-hover:bg-primary group-hover:text-primary"
            } transition-colors duration-150 group-hover:bg-opacity-10`}
          >
            {React.createElement(icon.icon, null, null)}
          </div>
          {icon.name != "Share" && (
            <p
              className={`ml-3 text-sm ${
                icon.name == "Retweet"
                  ? "group-hover:text-green"
                  : icon.name == "Like"
                  ? "group-hover:text-pink"
                  : "group-hover:text-primary"
              } transition-colors duration-150`}
            >
              5
            </p>
          )}
        </button>
      ))}
    </div>
  );
};

export default TweetActions;
