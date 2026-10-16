import Head from "next/head";

import { Button } from "../../components/common/Button";
import EmptyState from "../../components/common/EmptyState";
import PageHeader from "../../components/layout/PageHeader";
import ConversationView from "../../components/messages/ConversationView";
import Inbox, { conversationPath } from "../../components/messages/Inbox";
import MessagesLayout from "../../components/messages/MessagesLayout";
import { useMediaQuery } from "../../components/messages/useMediaQuery";
import { USERNAME_PATTERN } from "../../lib/constants";
import { readInbox } from "../../lib/db/messages/inbox";
import { withPageState } from "../../lib/server/pageState";
import { directConversationId } from "../../lib/superapp/messages";
import { messagesState } from "../../slices/messagesSlice";
import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch } from "../../store";
import { NextPageWithShell } from "../../types/PageShell";
import { FeatureStatus } from "../../types/Superapp";
import { IAuthor } from "../../types/User";

/** /messages?to=<username> when that conversation doesn't exist yet. */
type Draft =
  | { other: IAuthor; conversationId: string; serverNow: string }
  /** `to` names nobody, or the viewer. */
  | { problem: "unknown" | "self" };

interface MessagesPageProps {
  feature: FeatureStatus;
  draft: Draft | null;
}

function NewMessageButton() {
  const dispatch = useAppDispatch();
  return (
    <Button
      size="lg"
      aria-haspopup="dialog"
      onClick={() => dispatch(openDialog("newMessage"))}
    >
      New message
    </Button>
  );
}

/** The right pane before a conversation is chosen (wide screens). */
function SelectMessage() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <EmptyState title="Select a message" action={<NewMessageButton />}>
        Choose from your existing conversations, start a new one, or just keep
        swimming.
      </EmptyState>
    </div>
  );
}

function DraftProblem({ problem }: { problem: "unknown" | "self" }) {
  return (
    <>
      <PageHeader title="Messages" back />
      <EmptyState
        title={
          problem === "self"
            ? "You can’t message yourself"
            : "This account doesn’t exist"
        }
        action={<NewMessageButton />}
      >
        {problem === "self"
          ? "Choose someone else to talk to."
          : "Check the username, or search for the person instead."}
      </EmptyState>
    </>
  );
}

function MessagesOff({ feature }: { feature: FeatureStatus }) {
  return (
    <>
      <PageHeader title="Messages" />
      <EmptyState title="Welcome to your inbox!">
        {feature === "unconfigured"
          ? "Messages needs SANITY_API_TOKEN on this deployment."
          : "Direct messages are turned off on this deployment."}
      </EmptyState>
    </>
  );
}

/**
 * The inbox, with "Select a message" beside it from 1024px. With
 * `?to=<username>` the server finds the conversation with that person and
 * redirects to it (307), or shows a draft that its first send creates:
 * nothing is written on GET.
 */
const MessagesPage: NextPageWithShell<MessagesPageProps> = ({
  feature,
  draft,
}) => {
  const wide = useMediaQuery("(min-width: 1024px)");
  const other = draft && "other" in draft ? draft : null;
  const title = other ? `${other.other.fullname} / Messages` : "Messages";

  return (
    <>
      <Head>
        <title>{`${title} / Twitter SuperApp`}</title>
      </Head>
      {feature !== "on" ? (
        <MessagesOff feature={feature} />
      ) : (
        <MessagesLayout
          show={draft ? "conversation" : "inbox"}
          // The shell is per page, so the draft keeps the phone tab bar.
          tabBar
          inbox={
            <Inbox
              as={draft ? "pane" : "page"}
              poll={!draft || wide}
              selectedId={other?.conversationId}
            />
          }
        >
          {!draft ? (
            <SelectMessage />
          ) : other ? (
            <ConversationView
              key={other.conversationId}
              conversationId={other.conversationId}
              other={other.other}
              serverNow={other.serverNow}
            />
          ) : (
            "problem" in draft && <DraftProblem problem={draft.problem} />
          )}
        </MessagesLayout>
      )}
    </>
  );
};

MessagesPage.shell = { layout: "wide", hideComposeButton: true };

export default MessagesPage;

export const getServerSideProps = withPageState<MessagesPageProps>(
  async ({ ctx, repo, viewer }) => {
    // The nav always links here: with Messages off it says so, no 404.
    const feature = repo.featureStatus("messages");
    if (feature !== "on") return { props: { feature, draft: null } };

    // Read alongside; readInbox never throws, so a redirect can drop it.
    const inbox = readInbox(repo.messages, viewer.username);
    const { to } = ctx.query;
    if (to === undefined || to === "") {
      return {
        props: { feature, draft: null },
        state: { messages: messagesState(await inbox) },
      };
    }

    const user =
      typeof to === "string" && USERNAME_PATTERN.test(to)
        ? await repo.getUser(to)
        : null;
    const problem = !user
      ? "unknown"
      : user.username.toLowerCase() === viewer.username.toLowerCase()
        ? "self"
        : null;
    if (!user || problem) {
      ctx.res.statusCode = 404;
      return {
        props: { feature, draft: { problem: problem ?? "unknown" } },
        state: { messages: messagesState(await inbox) },
      };
    }

    const existing = await repo.messages.findDirect(
      viewer.username,
      user.username
    );
    if (existing) {
      return {
        redirect: {
          destination: conversationPath(existing.id),
          permanent: false,
        },
      };
    }

    return {
      props: {
        feature,
        draft: {
          other: {
            username: user.username,
            fullname: user.fullname,
            image: user.image,
          },
          conversationId: directConversationId(viewer.username, user.username),
          serverNow: new Date().toISOString(),
        },
      },
      state: { messages: messagesState(await inbox) },
    };
  }
);
