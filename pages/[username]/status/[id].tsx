import Head from "next/head";

import PageHeader from "../../../components/layout/PageHeader";
import Composer from "../../../components/tweet/Composer";
import ReplyCard from "../../../components/tweet/ReplyCard";
import TweetDetail from "../../../components/tweet/TweetDetail";
import { tweetsAdapter } from "../../../slices/tweetsSlice";
import { withPageState } from "../../../lib/server/pageState";
import { useAppSelector } from "../../../store";

export default function Status({ id }: { id: string }) {
  const tweet = useAppSelector((state) => state.tweets.entities[id]);
  const replies = useAppSelector((state) => state.replies[id]) ?? [];

  if (!tweet) return <PageHeader title="Tweet" back />;

  const excerpt =
    tweet.text.length > 60 ? `${tweet.text.slice(0, 60)}…` : tweet.text;

  return (
    <>
      <Head>
        <title>{`${tweet.author.fullname} on Twitter SuperApp: "${excerpt}"`}</title>
      </Head>
      <PageHeader title="Tweet" back />
      <TweetDetail tweet={tweet} />
      <div className="border-b border-line">
        <Composer
          id="reply"
          replyTo={{ tweetId: tweet.id, username: tweet.author.username }}
        />
      </div>
      <section aria-label="Replies">
        {replies.map((reply) => (
          <ReplyCard
            key={reply.id}
            reply={reply}
            replyingTo={tweet.author.username}
          />
        ))}
      </section>
    </>
  );
}

export const getServerSideProps = withPageState<{ id: string }>(
  async ({ ctx, repo, viewer }) => {
    const { username, id } = ctx.params ?? {};
    if (typeof id !== "string" || typeof username !== "string")
      return { notFound: true };

    const tweet = await repo.getTweet(id, viewer.username);
    if (!tweet) return { notFound: true };

    // The URL's username must be the author's (twitter.com does the same).
    if (tweet.author.username !== username) {
      return {
        redirect: {
          destination: `/${tweet.author.username}/status/${encodeURIComponent(id)}`,
          permanent: false,
        },
      };
    }

    return {
      props: { id },
      state: {
        tweets: tweetsAdapter.setAll(tweetsAdapter.getInitialState(), [tweet]),
        replies: { [id]: await repo.listReplies(id) },
      },
    };
  }
);
