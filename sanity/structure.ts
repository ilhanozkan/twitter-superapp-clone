import type { StructureResolver } from "sanity/structure";

import { apiVersion } from "./env";

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
    ]);
