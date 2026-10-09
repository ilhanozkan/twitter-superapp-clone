import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

import { getCurrentUsername } from "../auth";
import { getRepository } from "../db";
import { LIMITS } from "../superapp/limits";
import { formatAmount } from "../superapp/money";
import {
  canPayRequest,
  canViewRequest,
  canViewTransfer,
} from "../superapp/policy/wallet";
import { PaymentRequestResponse } from "../../types/Api";
import { IAuthor } from "../../types/User";
import {
  IPaymentRequest,
  ITransfer,
  PaymentRequestStatus,
} from "../../types/Wallet";
import { forbidden, invalid, notFound } from "./errors";
import { createHandler } from "./handler";
import { cents, note, pageQuery, routeKey, username } from "./validation";

// Request schemas and shared steps of the wallet routes. Bodies name only
// the other party; the acting user always comes from lib/auth.ts, and
// unknown fields (from, payer, requester...) are dropped by the schemas.

export const sendBody = z.object({
  to: username,
  amount: cents(LIMITS.payment.min, LIMITS.payment.max),
  note: note(LIMITS.noteMax),
});

const topUpChoices = LIMITS.topUp.amounts.map(formatAmount);

export const topUpBody = z.object({
  amount: z.literal(LIMITS.topUp.amounts, {
    error: `Amount must be ${topUpChoices.slice(0, -1).join(", ")} or ${topUpChoices.at(-1)} credits`,
  }),
});

export const requestBody = z.object({
  /** Who is asked to pay. */
  from: username,
  amount: cents(LIMITS.payment.min, LIMITS.payment.max),
  note: note(LIMITS.noteMax),
});

export const tipBody = z.object({
  amount: cents(LIMITS.tip.min, LIMITS.tip.max),
  note: note(LIMITS.noteMax),
});

const REQUEST_STATUSES: [PaymentRequestStatus, ...PaymentRequestStatus[]] = [
  "pending",
  "paid",
  "declined",
  "cancelled",
  "expired",
];

export const requestsQuery = z.object({
  role: z.enum(["incoming", "outgoing"], {
    error: "role must be incoming or outgoing",
  }),
  status: z.enum(REQUEST_STATUSES).optional(),
});

export const activityQuery = pageQuery;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A 400 when a body names the current user as the other party. */
export function assertNotSelf(other: string, path: string, message: string) {
  if (same(other, getCurrentUsername())) throw invalid(path, message);
}

/** The other party of a payment or request: someone with a profile (404 otherwise). */
export async function findParty(username: string): Promise<IAuthor> {
  const user = await getRepository().getUser(username);
  if (!user) throw notFound("User not found");
  return {
    username: user.username,
    fullname: user.fullname,
    image: user.image,
  };
}

/** A transfer the viewer is a party to; 404 for everyone else, so ids reveal nothing. */
export async function visibleTransfer(
  id: string,
  viewer: string
): Promise<ITransfer> {
  const transfer = await getRepository().wallet.getTransfer(id);
  if (!transfer || !canViewTransfer(viewer, transfer)) {
    throw notFound("Transfer not found");
  }
  return transfer;
}

/** A payment request the viewer is a party to; 404 for everyone else. */
export async function visibleRequest(
  id: string,
  viewer: string
): Promise<IPaymentRequest> {
  const request = await getRepository().wallet.getRequest(id);
  if (!request || !canViewRequest(viewer, request)) {
    throw notFound("Request not found");
  }
  return request;
}

/** The requester can see their request but not pay it. */
export function assertCanPay(viewer: string, request: IPaymentRequest) {
  if (!canPayRequest(viewer, request)) {
    throw forbidden("You can't pay your own request");
  }
}

export const transferLocation = (transfer: ITransfer) =>
  `/api/wallet/transfers/${encodeURIComponent(transfer.id)}`;

export const requestLocation = (request: IPaymentRequest) =>
  `/api/wallet/requests/${encodeURIComponent(request.id)}`;

/**
 * POST /api/wallet/requests/:id/decline (the payer) or /cancel (the
 * requester). Idempotent by target state, so it takes no key: repeating it
 * answers 200 with the request as it is. The other party gets 403, anyone
 * else 404, and a request that is paid, expired or closed the other way 409.
 */
export function createCloseRequestHandler(action: "decline" | "cancel") {
  return createHandler(
    {
      async POST(
        req: NextApiRequest,
        res: NextApiResponse<PaymentRequestResponse>
      ) {
        const id = routeKey(req, "id", "Request not found");
        const viewer = getCurrentUsername();
        await visibleRequest(id, viewer);

        const { request } = await getRepository().wallet.closeRequest(
          id,
          viewer,
          action
        );
        res.status(200).json({ request });
      },
    },
    { feature: "wallet" }
  );
}
