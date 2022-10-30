export default {
  name: "tweet",
  title: "Tweet",
  type: "document",
  fields: [
    {
      name: "tweet",
      title: "Tweet message",
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
      name: "userImage",
      title: "User's profile image",
      type: "string",
    },
    {
      name: "tweetImage",
      title: "Tweet image",
      type: "string",
    },
    {
      name: "blockTweet",
      title: "Block Tweet",
      description: "Disable/Active a tweet",
      type: "boolean",
    },
  ],
  initialValue: { blockTweet: false },
};
