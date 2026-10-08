import { commentType } from "./comment";
import { bookmarkType, likeType, retweetType } from "./reactions";
import { tweetType } from "./tweet";
import { userType } from "./user";

export const schemaTypes = [
  tweetType,
  commentType,
  userType,
  likeType,
  retweetType,
  bookmarkType,
];
