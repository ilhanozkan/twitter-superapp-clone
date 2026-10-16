import Head from "next/head";

import ConversationView from "../../components/messages/ConversationView";
import Inbox from "../../components/messages/Inbox";
import MessagesLayout from "../../components/messages/MessagesLayout";
import { useMediaQuery } from "../../components/messages/useMediaQuery";
import { readInbox } from "../../lib/db/messages/inbox";
import { KEY_PATTERN } from "../../lib/db/sanity/ids";
import { withPageState } from "../../lib/server/pageState";
import {
  messagesState,
  THREAD_PAGE_SIZE,
  threadFromPage,
} from "../../slices/messagesSlice";
import { NextPageWithShell } from "../../types/PageShell";
import { IAuthor } from "../../types/User";

interface ConversationPageProps {
  conversationId: string;
  other: IAuthor;
  serverNow: string;
}

/**
 * One direct conversation, in focus mode on phones (no tab bar; the
 * composer is pinned at the bottom) and beside the inbox from 1024px.
 * Only its two members can open it; anyone else gets a 404.
 */
const ConversationPage: NextPageWithShell<ConversationPageProps> = ({
  conversationId,
  other,
  serverNow,
}) => {
  // The list beside the conversation shows (and polls) from 1024px only.
  const wide = useMediaQuery("(min-width: 1024px)");

  return (
    <>
      <Head>
        <title>{`${other.fullname} / Messages / Twitter SuperApp`}</title>
      </Head>
      <MessagesLayout
        show="conversation"
        inbox={<Inbox as="pane" poll={wide} selectedId={conversationId} />}
      >
        <ConversationView
          key={conversationId}
          conversationId={conversationId}
          other={other}
          serverNow={serverNow}
        />
      </MessagesLayout>
    </>
  );
};

ConversationPage.shell = {
  layout: "wide",
  hideMobileNav: true,
  hideComposeButton: true,
};

export default ConversationPage;

export const getServerSideProps = withPageState<ConversationPageProps>(
  async ({ ctx, repo, viewer }) => {
    const id = ctx.params?.id;
    if (typeof id !== "string" || !KEY_PATTERN.test(id)) {
      return { notFound: true };
    }
    // Reading never marks anything read: the open page does, with a PUT.
    const conversation = await repo.messages.getConversation(
      id,
      viewer.username
    );
    if (!conversation) return { notFound: true };

    const [page, inbox] = await Promise.all([
      repo.messages.listMessages(id, viewer.username, {
        limit: THREAD_PAGE_SIZE,
      }),
      readInbox(repo.messages, viewer.username),
    ]);
    return {
      props: {
        conversationId: conversation.id,
        other: conversation.other,
        serverNow: page.serverNow,
      },
      state: {
        messages: messagesState(inbox, threadFromPage(conversation, page)),
      },
    };
  },
  { feature: "messages" }
);
