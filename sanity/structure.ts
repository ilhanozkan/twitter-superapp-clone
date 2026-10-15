import type { StructureBuilder, StructureResolver } from "sanity/structure";

import { apiVersion } from "./env";
import { SUPERAPP_FILES } from "./schemaTypes";
import type { SchemaFile } from "./schemaTypes/schemaFile";

const { wallet, business, shop, orders, rides, stories, messages } =
  SUPERAPP_FILES;

// The SuperApp desk: each group lists its features' entries in this order.
// A group whose features have shipped nothing yet is left out.
const SUPERAPP_GROUPS: { title: string; files: SchemaFile[] }[] = [
  { title: "Money", files: [wallet] },
  { title: "Food", files: [business, shop, orders] },
  { title: "Rides", files: [rides] },
  { title: "Stories", files: [stories] },
  { title: "Channels", files: [messages] },
];

function superappItems(S: StructureBuilder) {
  const groups = SUPERAPP_GROUPS.map(({ title, files }) => ({
    title,
    items: files.flatMap((file) => file.structureItems(S)),
  })).filter(({ items }) => items.length > 0);

  if (groups.length === 0) return [];
  return [
    S.divider().title("SuperApp"),
    ...groups.map(({ title, items }) =>
      S.listItem().title(title).child(S.list().title(title).items(items))
    ),
  ];
}

export const structure: StructureResolver = (S) =>
  S.list()
    .title("Content")
    .items([
      S.documentTypeListItem("tweet").title("Tweets"),
      S.listItem()
        .title("Blocked tweets")
        .child(
          S.documentList()
            .title("Blocked tweets")
            .apiVersion(apiVersion)
            .filter('_type == "tweet" && blockTweet == true')
        ),
      S.documentTypeListItem("comment").title("Replies"),
      S.documentTypeListItem("user").title("Users"),
      S.divider(),
      S.documentTypeListItem("like").title("Likes"),
      S.documentTypeListItem("retweet").title("Retweets"),
      S.documentTypeListItem("bookmark").title("Bookmarks"),
      ...superappItems(S),
    ]);
