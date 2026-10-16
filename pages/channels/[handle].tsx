import Head from "next/head";

import { ChannelPane } from "../../components/channels/ChannelList";
import ChannelView from "../../components/channels/ChannelView";
import { channelPath } from "../../components/channels/paths";
import MessagesLayout from "../../components/messages/MessagesLayout";
import { readChannels } from "../../lib/db/messages/inbox";
import { withPageState } from "../../lib/server/pageState";
import { parseChannelHandle } from "../../lib/superapp/messages";
import { channelsState } from "../../slices/channelsSlice";
import { THREAD_PAGE_SIZE } from "../../slices/messagesSlice";
import { NextPageWithShell } from "../../types/PageShell";

interface ChannelPageProps {
  handle: string;
}

/**
 * One channel, readable by anyone. In focus mode on phones (no tab bar;
 * the composer, or "Join to send messages", pinned at the bottom) and
 * beside "Your channels" from 1024px.
 */
const ChannelPage: NextPageWithShell<ChannelPageProps> = ({ handle }) => (
  <>
    <Head>
      <title>{`#${handle} / Channels / Twitter SuperApp`}</title>
    </Head>
    <MessagesLayout
      show="conversation"
      inbox={<ChannelPane selected={handle} />}
    >
      <ChannelView key={handle} handle={handle} />
    </MessagesLayout>
  </>
);

ChannelPage.shell = {
  layout: "wide",
  hideMobileNav: true,
  hideComposeButton: true,
};

export default ChannelPage;

export const getServerSideProps = withPageState<ChannelPageProps>(
  async ({ ctx, repo, viewer }) => {
    const raw = ctx.params?.handle;
    const handle = parseChannelHandle(raw);
    if (!handle) return { notFound: true };
    // Handles are lower case: /channels/Ankara_Eats is #ankara_eats.
    if (handle !== raw) {
      return {
        redirect: { destination: channelPath(handle), permanent: false },
      };
    }

    // Reading never marks anything read: the open page does, with a PUT.
    const channel = await repo.channels.getChannel(handle, viewer.username);
    if (!channel) return { notFound: true };
    const [page, mine] = await Promise.all([
      repo.messages.listMessages(channel.id, viewer.username, {
        limit: THREAD_PAGE_SIZE,
      }),
      readChannels(repo.channels, { member: viewer.username }, viewer.username),
    ]);
    return {
      props: { handle },
      state: { channels: channelsState({ mine, thread: { channel, page } }) },
    };
  },
  { feature: "channels" }
);
