import { unbuiltWallet } from "../stubs";
import { WalletRepository } from "../wallet/types";
import { SanityDeps } from "./deps";

export function createSanityWallet(deps: SanityDeps): WalletRepository {
  return unbuiltWallet(deps.canReadPrivate);
}
