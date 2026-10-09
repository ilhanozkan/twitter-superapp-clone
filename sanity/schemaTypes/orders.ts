import type { SchemaTypeDefinition } from "sanity";
import type { ListItemBuilder, StructureBuilder } from "sanity/structure";

// Stub: the orders lane replaces this file. It adds `order` (locked).

export const types: SchemaTypeDefinition[] = [];

/** Entries of the "Food" group, after Products: Orders. */
export const structureItems: (
  S: StructureBuilder
) => ListItemBuilder[] = () => [];

export const APP_CREATED_TYPES: string[] = [];
export const LOCKED_TYPES: string[] = [];
export const MODERATED_TYPES: string[] = [];
