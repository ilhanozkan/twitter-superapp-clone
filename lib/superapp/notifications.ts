import { INotification } from "../../types/Notification";
import { IPaymentRequest, ITransfer } from "../../types/Wallet";

// Wallet notifications are derived from transfers and payment requests on
// every read, never stored, so their ids are stable (§13) and they can't
// drift from the money records they describe. Both stores gather the
// records; these functions decide what each one says and to whom.

type TweetRef = { id: string; text: string };

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const author = ({ username, fullname, image }: ITransfer["to"]) => ({
  username,
  fullname,
  image,
});

/** Transfers that notify their recipient: tips on Tweets and payments. */
export function notifiesRecipient(transfer: ITransfer): boolean {
  return (
    transfer.from !== null &&
    ((transfer.kind === "tip" && transfer.context?.type === "tweet") ||
      transfer.kind === "payment")
  );
}

/**
 * What a transfer tells its recipient, or null if it tells them nothing.
 * `tweet` is the tipped Tweet, or null once it is deleted or moderated.
 */
export function transferNotification(
  transfer: ITransfer,
  tweet: TweetRef | null
): INotification | null {
  if (!notifiesRecipient(transfer)) return null;
  const base = {
    createdAt: transfer.createdAt,
    actor: author(transfer.from!),
    amount: transfer.amount,
    transferId: transfer.id,
  };

  if (transfer.kind === "tip") {
    return { ...base, id: `tip-${transfer.id}`, type: "tip", tweet };
  }
  return {
    ...base,
    id: `pay-${transfer.id}`,
    type: "payment",
    note: transfer.note,
    conversationId:
      transfer.context?.type === "conversation" ? transfer.context.id : null,
  };
}

/**
 * What a payment request tells `username`: the payer learns they were
 * asked; the requester learns it was paid or declined.
 */
export function requestNotifications(
  request: IPaymentRequest,
  username: string
): INotification[] {
  const notifications: INotification[] = [];

  if (same(request.payer.username, username)) {
    notifications.push({
      id: `preq-${request.id}`,
      type: "payment_request",
      createdAt: request.createdAt,
      actor: author(request.requester),
      amount: request.amount,
      note: request.note,
      requestId: request.id,
      conversationId: request.conversationId,
    });
  }

  if (
    same(request.requester.username, username) &&
    request.respondedAt &&
    (request.status === "paid" || request.status === "declined")
  ) {
    const paid = request.status === "paid";
    notifications.push({
      id: `preq-${paid ? "paid" : "declined"}-${request.id}`,
      type: paid ? "request_paid" : "request_declined",
      createdAt: request.respondedAt,
      actor: author(request.payer),
      amount: request.amount,
      requestId: request.id,
      transferId: request.transferId,
    });
  }

  return notifications;
}

/** Every wallet notification for `username` from the gathered records (unsorted). */
export function walletNotifications(
  username: string,
  transfers: { transfer: ITransfer; tweet: TweetRef | null }[],
  requests: IPaymentRequest[]
): INotification[] {
  return [
    ...transfers.flatMap(({ transfer, tweet }) => {
      const notification = same(transfer.to.username, username)
        ? transferNotification(transfer, tweet)
        : null;
      return notification ? [notification] : [];
    }),
    ...requests.flatMap((request) => requestNotifications(request, username)),
  ];
}
