export interface ITweet extends TweetBody {
  _id: string;
  _createdAt: string;
  _updatedAt: string;
  _rev: string;
  _type: "tweet";
  blockTweet: boolean;
}

export type TweetBody = {
  fullname: string;
  username: string;
  tweet: string;
  userImage: string;
  tweetImage?: string;
};

export interface ITweetsData {
  tweets: ITweet[];
}

export interface ITweetData {
  tweet: ITweet;
}
