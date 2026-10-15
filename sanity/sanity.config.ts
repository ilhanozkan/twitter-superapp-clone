import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { apiVersion, dataset, projectId } from "./env";
import {
  APP_CREATED_TYPES,
  LOCKED_TYPES,
  MODERATED_TYPES,
  schemaTypes,
} from "./schemaTypes";
import { structure } from "./structure";

// Locked and moderated documents are created by the app too, so no "Create"
// menu offers any of them.
const NOT_CREATABLE = new Set([
  ...APP_CREATED_TYPES,
  ...LOCKED_TYPES,
  ...MODERATED_TYPES,
]);
const LOCKED = new Set(LOCKED_TYPES);
const MODERATED = new Set(MODERATED_TYPES);

// Moderators edit a moderated document's open fields and publish them.
// Discarding an unpublished draft is harmless, so it stays too.
const MODERATOR_ACTIONS = new Set(["publish", "discardChanges"]);

export default defineConfig({
  name: "default",
  title: "Twitter SuperApp",
  projectId,
  dataset,
  plugins: [
    structureTool({ structure }),
    visionTool({ defaultApiVersion: apiVersion }),
  ],
  schema: { types: schemaTypes },
  document: {
    // App-created documents carry deterministic ids and fields only the app
    // keeps consistent (one like per user, ledger balances), so they are
    // never created by hand, from any pane or menu.
    newDocumentOptions: (templates) =>
      templates.filter((template) => !NOT_CREATABLE.has(template.templateId)),
    actions: (actions, { schemaType }) => {
      if (LOCKED.has(schemaType)) return [];
      if (MODERATED.has(schemaType)) {
        return actions.filter(
          ({ action }) => action !== undefined && MODERATOR_ACTIONS.has(action)
        );
      }
      return actions;
    },
  },
});
