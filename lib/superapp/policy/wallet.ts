import { IPaymentRequest, ITransfer } from "../../../types/Wallet";

// Who may see or act on money records. Only the parties ever can; the API
// answers 404 (not 403) to everyone else, so ids reveal nothing.

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function canViewTransfer(
  viewer: string,
  transfer: Pick<ITransfer, "from" | "to">
): boolean {
  return (
    same(viewer, transfer.to.username) ||
    (!!transfer.from && same(viewer, transfer.from.username))
  );
}

export function canViewRequest(
  viewer: string,
  request: Pick<IPaymentRequest, "requester" | "payer">
): boolean {
  return (
    same(viewer, request.requester.username) ||
    same(viewer, request.payer.username)
  );
}

/** Only the person asked to pay. */
export function canPayRequest(
  viewer: string,
  request: Pick<IPaymentRequest, "payer">
): boolean {
  return same(viewer, request.payer.username);
}

/** The payer declines; the requester cancels. */
export function canCloseRequest(
  viewer: string,
  request: Pick<IPaymentRequest, "requester" | "payer">,
  action: "decline" | "cancel"
): boolean {
  return action === "decline"
    ? same(viewer, request.payer.username)
    : same(viewer, request.requester.username);
}
