// Checks the demo-credit ledger's invariants (docs/SUPERAPP.md, §6.2)
// against the configured data source, and exits 1 when any fails:
//
//   npm run audit:ledger
//
// On Sanity it needs SANITY_API_TOKEN, because wallets and transfers are
// private documents. Variables are read from the environment, then from
// .env.local and .env.
import { existsSync } from "fs";

import { ConfigurationError, getRepository } from "../lib/db";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const repo = getRepository();
  const status = repo.featureStatus("wallet");
  if (status !== "on") {
    console.error(
      `The wallet is ${status} on the ${repo.source} data source, so there is nothing to audit.` +
        (status === "unconfigured" ? " Set SANITY_API_TOKEN." : "")
    );
    return 1;
  }

  const audit = await repo.wallet.audit();
  console.log(
    `${repo.source}: ${audit.wallets} wallets, ${audit.transfers} transfers, ` +
      `${audit.issued} cents issued, ${audit.totalBalance} cents in wallets`
  );
  if (audit.ok) {
    console.log("Ledger OK");
    return 0;
  }

  console.error("Ledger check FAILED");
  for (const { username, stored, computed } of audit.mismatches) {
    console.error(
      `  @${username}: stored ${stored}, transfers say ${computed}`
    );
  }
  if (audit.issued !== audit.totalBalance) {
    console.error("  issued credits and the total balance differ");
  }
  for (const [label, list] of [
    ["negative balance", audit.negative],
    ["pending over balance", audit.pendingOverBalance],
    ["bad reversal", audit.badReversals],
  ] as const) {
    for (const item of list) console.error(`  ${label}: ${item}`);
  }
  return 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    // A missing setting needs its message, not a stack trace.
    console.error(error instanceof ConfigurationError ? error.message : error);
    process.exit(1);
  }
);
