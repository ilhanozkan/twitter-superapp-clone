import { ITransfer } from "../../types/Wallet";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Whether `viewer` received or sent the transfer. */
export function transferDirection(
  transfer: ITransfer,
  viewer: string
): "received" | "sent" {
  return same(transfer.to.username, viewer) ? "received" : "sent";
}

/**
 * One line about a transfer from the viewer's side, e.g. "Tip on
 * @lenaframes's Tweet", "Order #K7Q2 · Kızılay Kahve", "Added demo credits".
 */
export function describeTransfer(transfer: ITransfer, viewer: string): string {
  const received = transferDirection(transfer, viewer) === "received";
  const other = received ? transfer.from : transfer.to;
  const otherName = other?.fullname ?? "SuperApp";
  const context = transfer.context;

  switch (transfer.kind) {
    case "issue":
      return "Added demo credits";
    case "tip":
      if (context?.type === "ride") {
        return received ? `Ride tip from ${otherName}` : `Tip for ${otherName}`;
      }
      return received
        ? `${otherName} tipped your Tweet`
        : `Tip on @${transfer.to.username}'s Tweet`;
    case "payment":
      return received ? `Payment from ${otherName}` : `Payment to ${otherName}`;
    case "request":
      return received
        ? `${otherName} paid your request`
        : `Paid ${otherName}'s request`;
    case "order":
      return context?.type === "order"
        ? `Order #${context.code} · ${otherName}`
        : `Order · ${otherName}`;
    case "order_refund":
      return context?.type === "order"
        ? `Refund · Order #${context.code}`
        : "Refund · Order";
    case "ride":
      return context?.type === "ride"
        ? `Ride #${context.code} · ${otherName}`
        : `Ride · ${otherName}`;
    case "ride_refund":
      return context?.type === "ride"
        ? `Refund · Ride #${context.code}`
        : "Refund · Ride";
  }
}

/** "TX-SEEDTX01": what people quote to support (and find in Studio). */
export function transferReference(id: string): string {
  return `TX-${id
    .replace(/^tx-/i, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()}`;
}

/** Held for `to` until holdUntil and not refunded: not spendable yet. */
export function isPending(transfer: ITransfer, now: number): boolean {
  return (
    !!transfer.holdUntil &&
    !transfer.reversedBy &&
    Date.parse(transfer.holdUntil) > now
  );
}
