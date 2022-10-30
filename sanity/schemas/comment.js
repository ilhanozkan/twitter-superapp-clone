export default {
  name: "comment",
  title: "Comment",
  type: "document",
  fields: [
    {
      name: "comment",
      title: "Comment",
      type: "string",
    },
    {
      name: "username",
      title: "Username",
      type: "string",
    },
    {
      name: "fullname",
      title: "Fullname",
      type: "string",
    },
    {
      name: "profileImg",
      title: "Profile image",
      type: "string",
    },
    {
      name: "likes",
      title: "Comment likes",
      type: "string",
    },
    {
      name: "tweet",
      title: "Tweet",
      type: "reference",
      to: { type: "tweet" },
    },
  ],
};
