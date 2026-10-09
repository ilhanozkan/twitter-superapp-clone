import type { SchemaTypeDefinition } from "sanity";
import type { ListItemBuilder, StructureBuilder } from "sanity/structure";

// Stub: the messages lane replaces this file. It adds `conversation` and
// `message` (moderated) and `conversationMember` (locked). Direct
// conversations are never listed in the desk.

export const types: SchemaTypeDefinition[] = [];

/** The "Channels" group: Channels, Removed messages. */
export const structureItems: (
  S: StructureBuilder
) => ListItemBuilder[] = () => [];

export const APP_CREATED_TYPES: string[] = [];
export const LOCKED_TYPES: string[] = [];
export const MODERATED_TYPES: string[] = [];
