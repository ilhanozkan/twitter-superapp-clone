import Link from "next/link";
import React from "react";

import { ITweetData } from "../types/Tweet";

const Tweet = ({ tweet }: ITweetData) => {
  const createdDate = new Date(tweet._createdAt).toUTCString();

  return (
    <article>
      <div className="flex items-center">
        <img
          src={tweet.userImage}
          alt={tweet.userImage}
          className="rounded-full"
        />
        <div className="ml-2 flex-col">
          <Link href="/">
            <a className="hover:underline">
              <p>
                <strong>{tweet.fullname}</strong>
              </p>
            </a>
          </Link>
          <Link href="/">
            <a>
              <p className="text-sm text-gray-600">@{tweet.username}</p>
            </a>
          </Link>
        </div>
      </div>
      <p>{tweet.tweet}</p>
      {tweet.tweetImage && (
        <img src={tweet.tweetImage} alt={tweet.tweet} className="max-w-md" />
      )}
      <p>{createdDate}</p>
    </article>
  );
};

export default Tweet;
