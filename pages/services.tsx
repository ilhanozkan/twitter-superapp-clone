import Head from "next/head";
import { IconType } from "react-icons";
import {
  HiOutlineChatBubbleLeftRight,
  HiOutlineShoppingBag,
  HiOutlineSparkles,
  HiOutlineUserGroup,
  HiOutlineVideoCamera,
  HiOutlineWallet,
} from "react-icons/hi2";
import { RiCarLine } from "react-icons/ri";

import PageHeader from "../components/layout/PageHeader";
import { REPOSITORY_URL } from "../components/layout/moreMenuItems";
import BusinessCarousel from "../components/shop/BusinessCarousel";
import LiveActivityRow from "../components/superapp/LiveActivityRow";
import ServiceTile from "../components/superapp/ServiceTile";
import { useLiveActivity } from "../components/superapp/useLiveActivity";
import WalletCard from "../components/superapp/WalletCard";
import { withPageState } from "../lib/server/pageState";
import { openDialog } from "../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../store";
import { FeatureId } from "../types/Superapp";

interface Tile {
  feature: FeatureId;
  href: string;
  title: string;
  description: string;
  icon: IconType;
}

const TILES: Tile[] = [
  {
    feature: "shop",
    href: "/food",
    title: "Food",
    description: "Order from places in Ankara",
    icon: HiOutlineShoppingBag,
  },
  {
    feature: "rides",
    href: "/rides",
    title: "Rides",
    description: "Book a ride across the city",
    icon: RiCarLine,
  },
  {
    feature: "messages",
    href: "/messages",
    title: "Messages",
    description: "Chat and pay friends",
    icon: HiOutlineChatBubbleLeftRight,
  },
  {
    feature: "channels",
    href: "/channels",
    title: "Channels",
    description: "Join group conversations",
    icon: HiOutlineUserGroup,
  },
  {
    feature: "wallet",
    href: "/wallet",
    title: "Wallet",
    description: "Send, request and add credits",
    icon: HiOutlineWallet,
  },
];

const LIVE_DOCS_URL = `${REPOSITORY_URL}/blob/master/docs/SUPERAPP.md#live`;

/**
 * Services: a launcher, not the only door (every action is also reachable
 * from Tweets, profiles, chats and notifications). Tiles show only for
 * features that are on.
 */
export default function Services() {
  const dispatch = useAppDispatch();
  const features = useAppSelector((state) => state.session.features);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const live = useLiveActivity();
  const tiles = TILES.filter((tile) => features[tile.feature]);

  return (
    <>
      <Head>
        <title>Services / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Services" subtitle="Wallet, food, rides and more" />

      <div className="flex flex-col gap-6 px-4 py-4">
        <WalletCard variant="services" />

        {live.length > 0 && (
          <section
            aria-labelledby="happening-now"
            className="overflow-hidden rounded-2xl border border-line"
          >
            <h2 id="happening-now" className="px-4 pt-3 text-xl font-extrabold">
              Happening now
            </h2>
            <ul>
              {live.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <LiveActivityRow item={item} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="Services">
          <ul className="grid grid-cols-2 gap-3 xs:grid-cols-3">
            {tiles.map((tile) => (
              <li key={tile.feature}>
                <ServiceTile
                  href={tile.href}
                  title={tile.title}
                  description={tile.description}
                  icon={tile.icon}
                />
              </li>
            ))}
            {features.stories && !readOnly && (
              <li>
                <ServiceTile
                  title="Stories"
                  description="Share a moment for 24 hours"
                  icon={HiOutlineSparkles}
                  onSelect={() => dispatch(openDialog("storyComposer"))}
                />
              </li>
            )}
          </ul>
        </section>

        <BusinessCarousel />

        <section
          aria-labelledby="roadmap"
          className="rounded-2xl bg-subtle p-4 text-[15px]"
        >
          <h2
            id="roadmap"
            className="flex items-center gap-2 text-xl font-extrabold"
          >
            <HiOutlineVideoCamera aria-hidden="true" />
            On the roadmap
          </h2>
          <p className="mt-2">
            Live broadcasts need a video streaming service, which this demo
            doesn’t include.{" "}
            <a
              href={LIVE_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              Read how they’d be added
            </a>
          </p>
        </section>
      </div>
    </>
  );
}

export const getServerSideProps = withPageState();
