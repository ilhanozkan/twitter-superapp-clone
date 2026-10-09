import * as business from "./business";
import { commentType } from "./comment";
import * as messages from "./messages";
import * as orders from "./orders";
import {
  bookmarkType,
  likeType,
  retweetType,
  REACTION_TYPES,
} from "./reactions";
import * as rides from "./rides";
import type { SchemaFile } from "./schemaFile";
import * as shop from "./shop";
import * as stories from "./stories";
import { tweetType } from "./tweet";
import { userType } from "./user";
import * as wallet from "./wallet";

/** One per SuperApp feature; each file owns its types, desk entries and rules. */
export const SUPERAPP_FILES = {
  wallet,
  business,
  shop,
  orders,
  rides,
  stories,
  messages,
} satisfies Record<string, SchemaFile>;

const files: SchemaFile[] = Object.values(SUPERAPP_FILES);

export const schemaTypes = [
  tweetType,
  commentType,
  userType,
  likeType,
  retweetType,
  bookmarkType,
  ...files.flatMap((file) => file.types),
];

// Reactions get deterministic ids from the app (that is what makes reacting
// idempotent), so they are app-created too.
export const APP_CREATED_TYPES = [
  ...REACTION_TYPES,
  ...files.flatMap((file) => file.APP_CREATED_TYPES),
];
export const LOCKED_TYPES = files.flatMap((file) => file.LOCKED_TYPES);
export const MODERATED_TYPES = files.flatMap((file) => file.MODERATED_TYPES);
