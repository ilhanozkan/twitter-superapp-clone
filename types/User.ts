import { AccountType } from "./Business";

/** The public identity attached to tweets, replies and reactions. */
export interface IAuthor {
  username: string;
  fullname: string;
  image: string | null;
}

export interface IUser extends IAuthor {
  bio: string | null;
  location: string | null;
  website: string | null;
  banner: string | null;
  verified: boolean;
  joinedAt: string;
  accountType: AccountType;
}

export interface IUserProfile extends IUser {
  tweetCount: number;
}
