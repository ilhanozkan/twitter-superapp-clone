// Proves that private SuperApp documents (wallets, transfers, messages...)
// are invisible without a token: it queries the configured Sanity dataset
// anonymously, by type and by "private." path, and exits 1 if anything
// comes back. It needs network access, so it is not part of CI:
//
//   npm run check:sanity-privacy
//
// Variables are read from the environment, then from .env.local and .env.
import { createClient } from "@sanity/client";
import { existsSync } from "fs";

import { getSanityConfig } from "../lib/config";
import { ConfigurationError } from "../lib/db/errors";
import { exposedPrivateDocuments } from "../lib/db/sanity/privacy";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

async function main() {
  const { projectId, dataset, apiVersion } = getSanityConfig();
  // No token on purpose; "raw" shows everything an anonymous caller can see,
  // drafts included.
  const anonymous = createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: false,
    perspective: "raw",
  });

  const exposed = await exposedPrivateDocuments(anonymous);
  if (exposed.length > 0) {
    console.error(
      `Private documents are readable without a token in ${projectId}/${dataset}:`
    );
    for (const id of exposed) console.error(`  ${id}`);
    return 1;
  }
  console.log(
    `${projectId}/${dataset}: no private document is readable anonymously.`
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    // A missing setting needs its message, not a stack trace.
    console.error(error instanceof ConfigurationError ? error.message : error);
    process.exit(1);
  }
);
