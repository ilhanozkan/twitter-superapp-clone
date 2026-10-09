import type { SchemaTypeDefinition } from "sanity";
import type { ListItemBuilder, StructureBuilder } from "sanity/structure";

/**
 * What every SuperApp schema file exports. index.ts, structure.ts and
 * sanity.config.ts combine them, so a feature only ever edits its own file.
 *
 * - `types`: its document (and object) types.
 * - `structureItems(S)`: its desk entries, shown in its group under the
 *   SuperApp divider (see structure.ts). Leave out types nobody should
 *   browse, such as locks and read receipts.
 * - `APP_CREATED_TYPES`: types only the app creates; hidden from every
 *   "Create" menu.
 * - `LOCKED_TYPES`: no document actions at all (no publish, delete,
 *   duplicate or unpublish), for records the app owns, such as the ledger.
 *   Make the type `readOnly` too, so no one starts a draft that could never
 *   be published.
 * - `MODERATED_TYPES`: publishing is the only action, so a moderator can
 *   change the fields left editable (e.g. `blocked`) but can't create,
 *   duplicate or delete.
 */
export interface SchemaFile {
  types: SchemaTypeDefinition[];
  structureItems(S: StructureBuilder): ListItemBuilder[];
  APP_CREATED_TYPES: readonly string[];
  LOCKED_TYPES: readonly string[];
  MODERATED_TYPES: readonly string[];
}
