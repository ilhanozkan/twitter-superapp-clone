import { CENTS_PER_CREDIT } from "../../lib/superapp/money";
import { Cents } from "../../types/Money";
import { IAuthor } from "../../types/User";

// The arguments of openDialog("send" | "request", args) (ui.dialogArgs are
// strings). `to` names the other party and locks the To step, as when the
// dialog opens from a profile, a Tweet menu, a chat or a receipt; `name`
// and `image` save looking them up; `amount` (cents) and `note` prefill.

export interface CreditsPrefill {
  /** The other party's username, when the dialog was opened for someone. */
  to: string | null;
  /** Who that is, when the caller said (otherwise it is looked up). */
  other: IAuthor | null;
  amount: Cents | null;
  note: string;
}

export function creditsDialogArgs(
  other: IAuthor,
  prefill: { amount?: Cents; note?: string | null } = {}
): Record<string, string> {
  const args: Record<string, string> = {
    to: other.username,
    name: other.fullname,
  };
  if (other.image) args.image = other.image;
  if (prefill.amount) args.amount = String(prefill.amount);
  if (prefill.note) args.note = prefill.note;
  return args;
}

export function readCreditsArgs(
  args: Record<string, string> | null
): CreditsPrefill {
  const to = args?.to?.trim() || null;
  const amount = /^\d{1,9}$/.test(args?.amount ?? "")
    ? Number(args?.amount)
    : null;
  return {
    to,
    other:
      to && args?.name
        ? { username: to, fullname: args.name, image: args.image || null }
        : null,
    amount: amount || null,
    note: args?.note ?? "",
  };
}

/** "12.50": an amount as the amount field shows it (no grouping commas). */
export function amountText(cents: Cents): string {
  const whole = Math.floor(cents / CENTS_PER_CREDIT);
  const fraction = String(cents % CENTS_PER_CREDIT).padStart(2, "0");
  return `${whole}.${fraction}`;
}

/** A receipt's page. */
export const receiptPath = (transferId: string) =>
  `/wallet/transactions/${encodeURIComponent(transferId)}`;
