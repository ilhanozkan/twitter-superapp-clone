import Link from "next/link";
import React from "react";
import TimeAgo from "react-timeago";

import { ITweetData } from "../../types/Tweet";
import TweetActions from "../tweetActions";

const Tweet = ({ tweet }: ITweetData) => {
  return (
    <article className="ml-4 flex">
      <div className="h-full">
        <img
          src={tweet.userImage}
          alt={tweet.userImage}
          className="cursor-pointer rounded-full"
        />
      </div>
      <div className="w-full">
        <div className="ml-2 w-tweet">
          <div>
            <div className="flex items-center gap-1">
              <Link href="/">
                <a className="hover:underline">
                  <p>
                    <strong>{tweet.fullname}</strong>
                  </p>
                </a>
              </Link>
              <Link href="/">
                <a className="text-sm text-gray-600">
                  <p>@{tweet.username}</p>
                </a>
              </Link>
              <p className="mb-2">.</p>
              <Link href="/">
                <a className="text-sm text-gray-600 hover:underline">
                  <p>
                    <TimeAgo date={tweet._createdAt} />
                  </p>
                </a>
              </Link>
            </div>

            <p className="block">{tweet.tweet}</p>
          </div>
          {tweet.tweetImage && (
            <img
              src={tweet.tweetImage}
              alt={tweet.tweet}
              className="mt-3 max-h-mh max-w-md rounded-2xl"
            />
          )}
          <TweetActions />
        </div>
      </div>
    </article>
  );
};

export default Tweet;
