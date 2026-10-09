import type { SchemaTypeDefinition } from "sanity";
import type { ListItemBuilder, StructureBuilder } from "sanity/structure";

// Stub: the stories lane replaces this file. It adds `story` (moderated:
// only `blocked` is editable) and `storyView` (locked).

export const types: SchemaTypeDefinition[] = [];

/** The "Stories" group: Stories, Blocked stories. */
export const structureItems: (
  S: StructureBuilder
) => ListItemBuilder[] = () => [];

export const APP_CREATED_TYPES: string[] = [];
export const LOCKED_TYPES: string[] = [];
export const MODERATED_TYPES: string[] = [];
