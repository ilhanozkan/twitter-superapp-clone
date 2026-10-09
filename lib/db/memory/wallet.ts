import { Cents } from "../../../types/Money";
import { ITransfer } from "../../../types/Wallet";
import { WalletSeed } from "../seeds/wallet";
import { unbuiltWallet } from "../stubs";
import { WalletRepository } from "../wallet/types";
import { MemoryDeps } from "./deps";

export interface StoredTransfer extends ITransfer {
  /** Fingerprint of the request that created it (primary records only). */
  requestHash: string | null;
}

export interface WalletMemoryState {
  /** Keyed by lower-cased username; a missing wallet reads as 0. */
  balances: Map<string, Cents>;
  transfers: Map<string, StoredTransfer>;
  /** Lower-cased usernames of frozen wallets. */
  frozen: Set<string>;
}

export function createWalletMemoryState(
  seed: WalletSeed | null
): WalletMemoryState {
  return {
    balances: new Map(Object.entries(seed?.balances ?? {})),
    transfers: new Map(
      (seed?.transfers ?? []).map((transfer) => [
        transfer.id,
        { ...transfer, requestHash: null },
      ])
    ),
    frozen: new Set(),
  };
}

export const createMemoryWallet: (deps: MemoryDeps) => WalletRepository = () =>
  unbuiltWallet(true);
