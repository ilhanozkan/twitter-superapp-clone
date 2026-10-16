import { formatCredits } from "../../lib/superapp/money";
import { IMessage } from "../../types/Message";
import { IPaymentRequest, PaymentRequestStatus } from "../../types/Wallet";
import { IAuthor } from "../../types/User";

// The words chat shows for each kind of message, from the viewer's side.
// Amounts are always text ("4.50 credits"), never a colour or icon alone.

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const isMine = (author: IAuthor, viewer: string) =>
  same(author.username, viewer);

export const REQUEST_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

/** "You sent 15.00 credits" or "Marco Rossi sent you 15.00 credits". */
export function describePayment(
  author: IAuthor,
  amount: number,
  viewer: string
): string {
  return isMine(author, viewer)
    ? `You sent ${formatCredits(amount)}`
    : `${author.fullname} sent you ${formatCredits(amount)}`;
}

/** "Sarah Chen requested 4.50 credits" or "You requested 4.50 credits from Ayşe Yılmaz". */
export function describeRequest(
  request: IPaymentRequest,
  viewer: string
): string {
  return isMine(request.requester, viewer)
    ? `You requested ${formatCredits(request.amount)} from ${request.payer.fullname}`
    : `${request.requester.fullname} requested ${formatCredits(request.amount)}`;
}

/**
 * One line for the inbox row: "You: Anytime 🙌", "💸 Requested 4.50
 * credits", "Sent you 15.00 credits". The row already names the other
 * person, so their own messages carry no prefix.
 */
export function previewText(message: IMessage | null, viewer: string): string {
  if (!message) return "No messages yet";
  const mine = isMine(message.author, viewer);
  const { body } = message;

  switch (body.type) {
    case "text": {
      const text = body.text.replace(/\s+/g, " ").trim();
      const what =
        text ||
        (body.tweet || !body.story ? "Shared a Tweet" : "Replied to a story");
      return mine ? `You: ${what}` : what;
    }
    case "payment":
      return mine
        ? `You sent ${formatCredits(body.amount)}`
        : `Sent you ${formatCredits(body.amount)}`;
    case "request":
      return mine
        ? `💸 You requested ${formatCredits(body.request.amount)}`
        : `💸 Requested ${formatCredits(body.request.amount)}`;
    case "removed":
      return "Message removed";
  }
}

/**
 * What someone else (or time) did to a request, from the viewer's side:
 * "Marco Rossi paid your 3.00 credits request". Null for what the viewer
 * did themselves (they already know) and for a pending request.
 */
export function requestChangeText(
  request: IPaymentRequest,
  viewer: string
): string | null {
  const amount = formatCredits(request.amount);
  const asked = isMine(request.requester, viewer);
  const { payer, requester } = request;
  switch (request.status) {
    case "paid":
      return asked ? `${payer.fullname} paid your ${amount} request` : null;
    case "declined":
      return asked ? `${payer.fullname} declined your ${amount} request` : null;
    case "cancelled":
      return asked
        ? null
        : `${requester.fullname} cancelled their ${amount} request`;
    case "expired":
      return asked
        ? `Your ${amount} request to ${payer.fullname} expired`
        : `${requester.fullname}’s ${amount} request expired`;
    case "pending":
      return null;
  }
}

/** "1 new message from Sarah Chen", "3 new messages" (several people). */
export function announcementText(authors: string[]): string {
  const count = authors.length;
  const noun = count === 1 ? "message" : "messages";
  const [first] = authors;
  return authors.every((name) => name === first)
    ? `${count} new ${noun} from ${first}`
    : `${count} new ${noun}`;
}
