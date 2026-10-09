import type { SchemaTypeDefinition } from "sanity";
import type { ListItemBuilder, StructureBuilder } from "sanity/structure";

// Stub: the rides lane replaces this file. It adds `driverProfile`
// (live-edited), `ride` and `driverLock` (locked).

export const types: SchemaTypeDefinition[] = [];

/** The "Rides" group: Drivers, Rides. */
export const structureItems: (
  S: StructureBuilder
) => ListItemBuilder[] = () => [];

export const APP_CREATED_TYPES: string[] = [];
export const LOCKED_TYPES: string[] = [];
export const MODERATED_TYPES: string[] = [];
