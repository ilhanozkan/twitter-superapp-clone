import Head from "next/head";
import { useEffect } from "react";

import { Button, ButtonLink } from "../../components/common/Button";
import EmptyState from "../../components/common/EmptyState";
import RelativeTime from "../../components/common/RelativeTime";
import PageHeader from "../../components/layout/PageHeader";
import StoryCanvas from "../../components/stories/StoryCanvas";
import { firstName } from "../../components/stories/storyText";
import { viewerArgs } from "../../components/stories/viewerArgs";
import { USERNAME_PATTERN } from "../../lib/constants";
import { withPageState } from "../../lib/server/pageState";
import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch } from "../../store";
import { NextPageWithShell } from "../../types/PageShell";
import { IStory } from "../../types/Story";
import { IAuthor } from "../../types/User";

interface StoriesPageProps {
  author: IAuthor;
  /** The author's visible stories, oldest first. */
  stories: IStory[];
  /** `?story=`: the one the link points at. */
  requested: string | null;
}

/**
 * /stories/<username>?story=<id>: a link to someone's stories. With
 * JavaScript it opens the full-screen viewer at once; the page underneath
 * (rendered on the server) lists the same stories, and says so when the
 * linked one has expired or been deleted.
 */
const StoriesPage: NextPageWithShell<StoriesPageProps> = ({
  author,
  stories,
  requested,
}) => {
  const dispatch = useAppDispatch();
  const available =
    requested === null || stories.some((story) => story.id === requested);

  const watch = (story: string | null) =>
    dispatch(
      openDialog("storyViewer", viewerArgs([author.username], { story }))
    );

  useEffect(() => {
    if (available && stories.length > 0) {
      dispatch(
        openDialog(
          "storyViewer",
          viewerArgs([author.username], { story: requested })
        )
      );
    }
  }, [dispatch, author.username, requested, available, stories.length]);

  const title = `${author.fullname}'s stories`;

  let body;
  if (!available) {
    body = (
      <EmptyState
        title="This story is no longer available"
        action={
          stories.length > 0 ? (
            <Button onClick={() => watch(null)}>
              Watch {firstName(author.fullname)}’s stories
            </Button>
          ) : (
            <ButtonLink href={`/${author.username}`} variant="outline">
              Go to @{author.username}
            </ButtonLink>
          )
        }
      >
        Stories disappear 24 hours after they are posted, and their authors can
        delete them sooner.
      </EmptyState>
    );
  } else if (stories.length === 0) {
    body = (
      <EmptyState
        title="No stories right now"
        action={
          <ButtonLink href={`/${author.username}`} variant="outline">
            Go to @{author.username}
          </ButtonLink>
        }
      >
        {author.fullname} hasn’t posted a story in the last 24 hours.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div className="px-4 pt-4">
          <Button onClick={() => watch(requested)}>Watch stories</Button>
        </div>
        <ol
          aria-label={title}
          className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3"
        >
          {stories.map((story, index) => (
            <li key={story.id} className="min-w-0">
              <StoryCanvas content={story.content} />
              <p className="mt-1 text-[13px] text-muted">
                Story {index + 1} of {stories.length} ·{" "}
                <RelativeTime iso={story.createdAt} />
              </p>
            </li>
          ))}
        </ol>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{`${title} / Twitter SuperApp`}</title>
      </Head>
      <PageHeader title={title} subtitle={`@${author.username}`} back />
      {body}
    </>
  );
};

StoriesPage.shell = { hideComposeButton: true };

export default StoriesPage;

export const getServerSideProps = withPageState<StoriesPageProps>(
  async ({ ctx, repo, viewer }) => {
    const username = ctx.params?.username;
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) {
      return { notFound: true };
    }
    const user = await repo.getUser(username);
    if (!user) return { notFound: true };

    const story = typeof ctx.query.story === "string" ? ctx.query.story : null;
    // Canonical casing in the URL, like profiles.
    if (user.username !== username) {
      const query = story ? `?story=${encodeURIComponent(story)}` : "";
      return {
        redirect: {
          destination: `/stories/${user.username}${query}`,
          permanent: false,
        },
      };
    }

    return {
      props: {
        author: {
          username: user.username,
          fullname: user.fullname,
          image: user.image,
        },
        stories: await repo.stories.listStories(user.username, viewer.username),
        requested: story,
      },
    };
  },
  { feature: "stories" }
);
