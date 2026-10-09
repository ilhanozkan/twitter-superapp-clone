import Head from "next/head";
import Link from "next/link";
import { ReactNode } from "react";
import { BsTwitter } from "react-icons/bs";
import {
  HiOutlineArrowUturnLeft,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocument,
  HiOutlineClock,
} from "react-icons/hi2";

import Avatar from "../../../components/common/Avatar";
import { ButtonLink } from "../../../components/common/Button";
import PageHeader from "../../../components/layout/PageHeader";
import LocalTime from "../../../components/superapp/LocalTime";
import Money from "../../../components/superapp/Money";
import {
  describeTransfer,
  isPending,
  transferDirection,
  transferReference,
} from "../../../components/superapp/transferText";
import { statusPath } from "../../../components/tweet/paths";
import { KEY_PATTERN } from "../../../lib/db/sanity/ids";
import { withPageState } from "../../../lib/server/pageState";
import { canViewTransfer } from "../../../lib/superapp/policy/wallet";
import { showToast } from "../../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../../store";
import { IFeatures } from "../../../types/Superapp";
import { IAuthor } from "../../../types/User";
import { ITransfer } from "../../../types/Wallet";

interface ReceiptProps {
  transfer: ITransfer;
  /** The tipped Tweet's path, or null once it is deleted. */
  tweetHref: string | null;
  serverNow: string;
}

const receiptPath = (id: string) =>
  `/wallet/transactions/${encodeURIComponent(id)}`;

function Party({ user }: { user: IAuthor | null }) {
  if (!user) {
    return (
      <span className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"
        >
          <BsTwitter />
        </span>
        <span>SuperApp · demo credits</span>
      </span>
    );
  }
  return (
    <Link
      href={`/${user.username}`}
      className="flex min-w-0 items-center gap-3 hover:underline"
    >
      <Avatar user={user} size={32} />
      <span className="min-w-0 leading-5">
        <span className="block truncate font-bold">{user.fullname}</span>
        <span className="block truncate text-muted">@{user.username}</span>
      </span>
    </Link>
  );
}

/** What the transfer paid for, as a link while that page exists. */
function ForLink({
  transfer,
  tweetHref,
  features,
}: {
  transfer: ITransfer;
  tweetHref: string | null;
  features: IFeatures;
}): ReactNode {
  const context = transfer.context;
  if (!context) return null;
  const link = (href: string, text: string) => (
    <Link href={href} className="text-primary hover:underline">
      {text}
    </Link>
  );

  switch (context.type) {
    case "tweet":
      return tweetHref ? link(tweetHref, "Tweet") : "Tweet deleted";
    case "conversation":
      return features.messages
        ? link(`/messages/${encodeURIComponent(context.id)}`, "Conversation")
        : "Conversation";
    case "request":
      return "Payment request";
    case "order":
      return features.orders
        ? link(
            `/orders/${encodeURIComponent(context.id)}`,
            `Order #${context.code}`
          )
        : `Order #${context.code}`;
    case "ride":
      return features.rides
        ? link(
            `/rides/${encodeURIComponent(context.id)}`,
            `Ride #${context.code}`
          )
        : `Ride #${context.code}`;
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="flex min-w-0 justify-end text-right">{children}</dd>
    </div>
  );
}

/** A receipt: only its two parties can open it; anyone else gets a 404. */
export default function Receipt({
  transfer,
  tweetHref,
  serverNow,
}: ReceiptProps) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const features = useAppSelector((state) => state.session.features);
  const username = viewer?.username ?? transfer.to.username;
  const direction = transferDirection(transfer, username);
  const other = direction === "received" ? transfer.from : transfer.to;
  const reference = transferReference(transfer.id);
  const pending = isPending(transfer, Date.parse(serverNow));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      dispatch(showToast({ message: "Reference copied" }));
    } catch {
      window.prompt("Copy the reference", reference);
    }
  };

  let status: ReactNode;
  if (transfer.reversedBy) {
    status = (
      <>
        <HiOutlineArrowUturnLeft aria-hidden="true" />
        Refunded ·{" "}
        <Link
          href={receiptPath(transfer.reversedBy)}
          className="text-primary underline underline-offset-2"
        >
          View refund
        </Link>
      </>
    );
  } else if (pending && transfer.holdUntil) {
    status = (
      <>
        <HiOutlineClock aria-hidden="true" />
        <span>
          Pending until <LocalTime iso={transfer.holdUntil} /> · refundable
          until then
        </span>
      </>
    );
  } else {
    status = (
      <>
        <HiOutlineCheckCircle aria-hidden="true" className="text-success" />
        Completed
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Receipt / Twitter SuperApp</title>
      </Head>
      <PageHeader title="Receipt" subtitle="Demo credits" back />

      <div className="flex flex-col items-center gap-2 border-b border-line px-4 py-6 text-center">
        <p className="text-[34px] font-extrabold leading-10 [overflow-wrap:anywhere]">
          <Money amount={transfer.amount} direction={direction} />
        </p>
        <p className="text-[15px]">{describeTransfer(transfer, username)}</p>
        <p className="flex flex-wrap items-center justify-center gap-1 text-[15px] text-muted">
          {status}
        </p>
        {transfer.reverses && (
          <p className="text-[15px] text-muted">
            Refund of{" "}
            <Link
              href={receiptPath(transfer.reverses)}
              className="text-primary underline underline-offset-2"
            >
              {transferReference(transfer.reverses)}
            </Link>
          </p>
        )}
      </div>

      <dl className="divide-y divide-line border-b border-line text-[15px]">
        <Row label="From">
          <Party user={transfer.from} />
        </Row>
        <Row label="To">
          <Party user={transfer.to} />
        </Row>
        <Row label="Date">
          <LocalTime iso={transfer.createdAt} format="full" />
        </Row>
        {transfer.note && (
          <Row label="Note">
            <span className="[overflow-wrap:anywhere]">{transfer.note}</span>
          </Row>
        )}
        {transfer.context && (
          <Row label="For">
            <ForLink
              transfer={transfer}
              tweetHref={tweetHref}
              features={features}
            />
          </Row>
        )}
        <Row label="Reference">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate font-mono text-[13px]">{reference}</span>
            <button
              type="button"
              aria-label="Copy reference"
              onClick={copy}
              className="shrink-0 rounded-full p-2 text-lg text-primary transition-colors hover:bg-primary/10"
            >
              <HiOutlineClipboardDocument aria-hidden="true" />
            </button>
          </span>
        </Row>
      </dl>

      {features.messages && other && (
        <div className="px-4 py-4">
          <ButtonLink
            href={`/messages?to=${encodeURIComponent(other.username)}`}
            variant="outline"
          >
            Message {other.fullname}
          </ButtonLink>
        </div>
      )}
    </>
  );
}

export const getServerSideProps = withPageState<ReceiptProps>(
  async ({ ctx, repo, viewer }) => {
    const id = ctx.params?.id;
    if (typeof id !== "string" || !KEY_PATTERN.test(id)) {
      return { notFound: true };
    }

    // Not a party is the same as missing: ids reveal nothing.
    const transfer = await repo.wallet.getTransfer(id);
    if (!transfer || !canViewTransfer(viewer.username, transfer)) {
      return { notFound: true };
    }

    let tweetHref: string | null = null;
    if (transfer.context?.type === "tweet") {
      const tweet = await repo.getTweet(transfer.context.id, viewer.username);
      tweetHref = tweet ? statusPath(tweet) : null;
    }

    return {
      props: { transfer, tweetHref, serverNow: new Date().toISOString() },
    };
  },
  { feature: "wallet" }
);
