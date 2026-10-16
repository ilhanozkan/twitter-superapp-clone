import Link from "next/link";
import { ReactNode } from "react";
import { BsTwitter } from "react-icons/bs";
import {
  HiOutlineArrowUturnLeft,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocument,
  HiOutlineClock,
  HiOutlinePaperAirplane,
} from "react-icons/hi2";

import { openDialog, showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IFeatures } from "../../types/Superapp";
import { IAuthor } from "../../types/User";
import { ITransfer } from "../../types/Wallet";
import Avatar from "../common/Avatar";
import { Button, ButtonLink } from "../common/Button";
import LocalTime from "../superapp/LocalTime";
import Money from "../superapp/Money";
import {
  describeTransfer,
  isPending,
  transferDirection,
  transferReference,
} from "../superapp/transferText";
import { creditsDialogArgs, receiptPath } from "./dialogArgs";

export interface ReceiptProps {
  transfer: ITransfer;
  /** The tipped Tweet's path, or null once it is deleted. */
  tweetHref: string | null;
  /** When the receipt was read, by the server's clock: it decides "Pending". */
  serverNow: string;
}

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

function Status({
  transfer,
  pending,
}: {
  transfer: ITransfer;
  pending: boolean;
}) {
  if (transfer.reversedBy) {
    return (
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
  }
  if (pending && transfer.holdUntil) {
    return (
      <>
        <HiOutlineClock aria-hidden="true" />
        <span>
          Pending until <LocalTime iso={transfer.holdUntil} /> · refundable
          until then
        </span>
      </>
    );
  }
  return (
    <>
      <HiOutlineCheckCircle aria-hidden="true" className="text-success" />
      Completed
    </>
  );
}

/**
 * A receipt (only its two parties ever see one): the signed amount and its
 * status (Completed, Pending until a time, or Refunded with a link to the
 * refund), both parties, the date, the note, what it paid for and a
 * reference to quote. Payments the viewer made can be sent again, and the
 * other party messaged while Messages is on.
 */
export default function Receipt({
  transfer,
  tweetHref,
  serverNow,
}: ReceiptProps) {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const features = useAppSelector((state) => state.session.features);
  const username = viewer?.username ?? transfer.to.username;
  const direction = transferDirection(transfer, username);
  const other = direction === "received" ? transfer.from : transfer.to;
  const reference = transferReference(transfer.id);
  const pending = isPending(transfer, Date.parse(serverNow));
  // A payment (or a paid request) the viewer made: repeat it to the same person.
  const canSendAgain =
    !readOnly &&
    features.wallet &&
    direction === "sent" &&
    (transfer.kind === "payment" || transfer.kind === "request");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reference);
      dispatch(showToast({ message: "Reference copied" }));
    } catch {
      window.prompt("Copy the reference", reference);
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-2 border-b border-line px-4 py-6 text-center">
        <p className="text-[34px] font-extrabold leading-10 [overflow-wrap:anywhere]">
          <Money amount={transfer.amount} direction={direction} />
        </p>
        <p className="text-[15px]">{describeTransfer(transfer, username)}</p>
        <p className="flex flex-wrap items-center justify-center gap-1 text-[15px] text-muted">
          <Status transfer={transfer} pending={pending} />
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

      {other && (canSendAgain || features.messages) && (
        <div className="flex flex-wrap gap-3 px-4 py-4">
          {canSendAgain && (
            <Button
              aria-haspopup="dialog"
              onClick={() =>
                dispatch(
                  openDialog(
                    "send",
                    creditsDialogArgs(other, {
                      amount: transfer.amount,
                      note: transfer.note,
                    })
                  )
                )
              }
              className="gap-2"
            >
              <HiOutlinePaperAirplane aria-hidden="true" className="text-lg" />
              Send again
            </Button>
          )}
          {features.messages && (
            <ButtonLink
              href={`/messages?to=${encodeURIComponent(other.username)}`}
              variant="outline"
            >
              Message {other.fullname}
            </ButtonLink>
          )}
        </div>
      )}
    </>
  );
}
