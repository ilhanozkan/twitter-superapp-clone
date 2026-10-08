import { visionTool } from "@sanity/vision";
import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";

import { apiVersion, dataset, projectId } from "./env";
import { schemaTypes } from "./schemaTypes";
import { REACTION_TYPES } from "./schemaTypes/reactions";
import { structure } from "./structure";

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
    // Reactions are created by the app with deterministic ids; creating them
    // by hand would allow duplicate likes.
    newDocumentOptions: (templates, { creationContext }) =>
      creationContext.type === "global"
        ? templates.filter(
            (template) => !REACTION_TYPES.includes(template.templateId)
          )
        : templates,
  },
});
