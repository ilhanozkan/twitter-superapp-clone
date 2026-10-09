import { useCallback } from "react";

import { ApiRequestError } from "../../lib/client/api";
import { WalletThunk } from "../../slices/walletUiSlice";
import { fetchWallet } from "../../slices/walletSlice";
import { useAppDispatch, useAppSelector } from "../../store";

// Errors after which the wallet in the store is out of date: re-read it, so
// the review step's "available" and the frozen banner catch up.
const STALE_WALLET = new Set(["insufficient_funds", "wallet_frozen"]);

const FROZEN = /^@([A-Za-z0-9_]+)'s wallet is frozen/;

/**
 * The server's error in words for this person: whose wallet is frozen, what
 * to do when rate limited. The status and code stay, because the review
 * step reads the code (insufficient funds offers "Add credits").
 */
export function friendlyMoneyError(
  error: unknown,
  viewer: string | null
): unknown {
  if (!(error instanceof ApiRequestError)) return error;

  let message = error.message;
  if (error.code === "wallet_frozen") {
    const owner = FROZEN.exec(error.message)?.[1];
    message =
      owner && viewer && owner.toLowerCase() === viewer.toLowerCase()
        ? "A moderator froze your wallet. You can’t send or receive credits right now."
        : owner
          ? `A moderator froze @${owner}’s wallet. Credits can’t move to or from it right now.`
          : "A moderator froze one of the wallets. Credits can’t move right now.";
  } else if (error.code === "rate_limited") {
    message =
      "That’s a lot of payments in a minute. Wait a moment, then try again.";
  }
  return message === error.message
    ? error
    : new ApiRequestError(error.status, error.code, message, error.requestId);
}

/**
 * Runs a money thunk from a dialog: resolves with what the server
 * confirmed, or throws the error in words for people (still an
 * ApiRequestError) after refreshing a wallet the failure showed was stale.
 */
export function useMoneyAction() {
  const dispatch = useAppDispatch();
  const viewer = useAppSelector(
    (state) => state.session.viewer?.username ?? null
  );

  return useCallback(
    async <R>(thunk: WalletThunk<R>): Promise<R> => {
      try {
        return await dispatch(thunk);
      } catch (error) {
        if (error instanceof ApiRequestError && STALE_WALLET.has(error.code)) {
          void dispatch(fetchWallet());
        }
        throw friendlyMoneyError(error, viewer);
      }
    },
    [dispatch, viewer]
  );
}
