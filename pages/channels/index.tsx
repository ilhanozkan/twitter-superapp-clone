import Head from "next/head";
import { useRouter } from "next/router";
import { useState } from "react";
import { HiPlus } from "react-icons/hi2";

import ChannelList from "../../components/channels/ChannelList";
import ChannelTabs from "../../components/channels/ChannelTabs";
import CreateChannelDialog from "../../components/channels/CreateChannelDialog";
import { channelsTabPath } from "../../components/channels/paths";
import { Button, ButtonLink } from "../../components/common/Button";
import EmptyState from "../../components/common/EmptyState";
import PageHeader from "../../components/layout/PageHeader";
import MessagesTabs from "../../components/messages/MessagesTabs";
import { readChannels } from "../../lib/db/messages/inbox";
import { withPageState } from "../../lib/server/pageState";
import {
  ChannelTab,
  channelsState,
  fetchChannels,
} from "../../slices/channelsSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { NextPageWithShell } from "../../types/PageShell";

const tabOf = (value: unknown): ChannelTab =>
  value === "discover" ? "discover" : "mine";

/**
 * Channels: "Your channels" (most recently active first) and Discover
 * (every channel, the biggest first), as cards with Join, plus "Create
 * channel". READ_ONLY hides Join and Create.
 */
const ChannelsPage: NextPageWithShell = () => {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const tab = tabOf(router.query.tab);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const messagesOn = useAppSelector((state) => state.session.features.messages);
  const lists = useAppSelector((state) => state.channels);
  const [creating, setCreating] = useState(false);

  const create = !readOnly && (
    <Button size="lg" aria-haspopup="dialog" onClick={() => setCreating(true)}>
      Create channel
    </Button>
  );

  return (
    <>
      <Head>
        <title>Channels / Twitter SuperApp</title>
      </Head>
      <PageHeader
        title="Channels"
        subtitle="Public group conversations"
        actions={
          !readOnly && (
            <button
              type="button"
              aria-label="Create channel"
              aria-haspopup="dialog"
              title="Create channel"
              onClick={() => setCreating(true)}
              className="rounded-full p-2 text-xl transition-colors hover:bg-fg/10"
            >
              <HiPlus aria-hidden="true" />
            </button>
          )
        }
      />
      {messagesOn && <MessagesTabs current="channels" />}
      <ChannelTabs tab={tab} />

      <div hidden={tab !== "mine"}>
        <ChannelList
          label="Your channels"
          channels={lists.mine.items}
          error={lists.mine.error}
          onRetry={() => dispatch(fetchChannels("mine")).catch(() => {})}
          empty={
            <EmptyState
              title="No channels yet"
              action={
                <div className="flex flex-wrap gap-3">
                  {create}
                  <ButtonLink
                    href={channelsTabPath("discover")}
                    shallow
                    scroll={false}
                    replace
                    variant="outline"
                    size="lg"
                  >
                    Discover
                  </ButtonLink>
                </div>
              }
            >
              {readOnly
                ? "Channels you join show here."
                : "Create one, or find one to join in Discover."}
            </EmptyState>
          }
        />
      </div>
      <div hidden={tab !== "discover"}>
        <ChannelList
          label="Discover"
          channels={lists.discover.items}
          error={lists.discover.error}
          onRetry={() => dispatch(fetchChannels("discover")).catch(() => {})}
          empty={
            <EmptyState title="No channels yet" action={create}>
              {readOnly
                ? "Nobody has created a channel yet."
                : "Create one, and others can join it."}
            </EmptyState>
          }
        />
      </div>

      <CreateChannelDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
};

ChannelsPage.shell = { layout: "wide", hideComposeButton: true };

export default ChannelsPage;

export const getServerSideProps = withPageState(
  async ({ repo, viewer }) => {
    // Both tabs are read now, so switching between them is instant.
    const [mine, discover] = await Promise.all([
      readChannels(repo.channels, { member: viewer.username }, viewer.username),
      readChannels(repo.channels, {}, viewer.username),
    ]);
    return { state: { channels: channelsState({ mine, discover }) } };
  },
  { feature: "channels" }
);
