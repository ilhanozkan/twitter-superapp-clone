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
          src={tweet.author.image ?? undefined}
          alt={tweet.author.fullname}
          className="h-12 w-12 cursor-pointer rounded-full"
        />
      </div>
      <div className="w-full">
        <div className="ml-2 w-tweet">
          <div>
            <div className="flex items-center gap-1">
              <Link href="/">
                <a className="hover:underline">
                  <p>
                    <strong>{tweet.author.fullname}</strong>
                  </p>
                </a>
              </Link>
              <Link href="/">
                <a className="text-sm text-gray-600">
                  <p>@{tweet.author.username}</p>
                </a>
              </Link>
              <p className="mb-2">.</p>
              <Link href="/">
                <a className="text-sm text-gray-600 hover:underline">
                  <p>
                    <TimeAgo date={tweet.createdAt} />
                  </p>
                </a>
              </Link>
            </div>

            <p className="block">{tweet.text}</p>
          </div>
          {tweet.image && (
            <img
              src={tweet.image}
              alt=""
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
