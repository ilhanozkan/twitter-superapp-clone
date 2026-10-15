// Writes the demo dataset as NDJSON for `sanity dataset import`, so a fresh
// Sanity project can start with the same content as the in-memory store.
// Private documents (wallets, transfers...) have "private." ids, which only
// a logged-in CLI or SANITY_AUTH_TOKEN can import (sanity/README.md).
//
//   npm run seed:sanity
//   cd sanity && npx sanity dataset import seed/demo.ndjson production --missing
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { seedToSanityDocuments } from "../lib/db/sanity/seed";
import { createSeedData } from "../lib/db/seed";

const outFile = path.join(__dirname, "..", "sanity", "seed", "demo.ndjson");
const documents = seedToSanityDocuments(createSeedData());

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(
  outFile,
  documents.map((document) => JSON.stringify(document)).join("\n") + "\n"
);

console.log(
  `Wrote ${documents.length} documents to ${path.relative(
    process.cwd(),
    outFile
  )}`
);
console.log(
  "Import them with: cd sanity && npx sanity dataset import seed/demo.ndjson <dataset> --missing"
);
const privateCount = documents.filter((document) =>
  document._id.startsWith("private.")
).length;
if (privateCount > 0) {
  console.log(
    `${privateCount} of them are private ("private." ids): the import needs \`npx sanity login\` or SANITY_AUTH_TOKEN.`
  );
}
