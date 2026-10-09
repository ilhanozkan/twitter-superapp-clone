import { ActivityResponse, WalletResponse } from "../../types/Api";
import { IFeatures } from "../../types/Superapp";
import type { Repository } from "../db";
import { loadActivity } from "./activity";

/** What every page's chrome shows besides the page itself. */
export interface ShellState {
  features: IFeatures;
  /** Businesses the viewer can run; [] when the read fails. */
  managedBusinesses: string[];
  /** null while the wallet is off, or when reading it fails. */
  wallet: WalletResponse | null;
  /** Zeros when reading it fails. */
  activity: ActivityResponse;
}

function logFailure(what: string, reason: unknown) {
  console.error(
    JSON.stringify({
      level: "error",
      message: `Loading the ${what} for the page shell failed`,
      error:
        reason instanceof Error
          ? (reason.stack ?? reason.message)
          : String(reason),
    })
  );
}

function valueOr<T>(
  result: PromiseSettledResult<T>,
  what: string,
  fallback: T
) {
  if (result.status === "fulfilled") return result.value;
  logFailure(what, result.reason);
  return fallback;
}

/**
 * The shell's data, each part read on its own: a failing feature read
 * degrades its widget (no wallet card, no badges), never the page.
 */
export async function loadShellState(
  repo: Repository,
  viewer: string,
  now: Date = new Date()
): Promise<ShellState> {
  const features = repo.features;
  const serverNow = now.toISOString();

  const [wallet, activity, managedBusinesses] = await Promise.allSettled([
    features.wallet
      ? Promise.all([
          repo.wallet.getWallet(viewer),
          repo.wallet.getLimits(viewer),
        ]).then(([wallet, limits]) => ({ wallet, limits, serverNow }))
      : null,
    loadActivity(repo, viewer, { now }),
    repo.business.listManagedBusinesses(viewer),
  ]);

  return {
    features,
    managedBusinesses: valueOr(managedBusinesses, "managed businesses", []),
    wallet: valueOr(wallet, "wallet", null),
    activity: valueOr(activity, "activity", {
      serverNow,
      unreadConversations: 0,
      newNotifications: 0,
      live: [],
    }),
  };
}
