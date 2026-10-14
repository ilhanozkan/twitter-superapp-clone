import { ChannelRole } from "../../../types/Message";

// Who may read, post in and moderate a conversation, from the viewer's
// membership role (null when they are not a member). Direct conversations
// are private to their two members: everyone else gets 404, so ids reveal
// nothing. Channels are public to read, but only members post.

export type ConversationKind = "direct" | "channel";

export function isMember(role: ChannelRole | null): boolean {
  return role !== null;
}

export function canRead(
  kind: ConversationKind,
  role: ChannelRole | null
): boolean {
  return kind === "channel" || isMember(role);
}

export function canPost(role: ChannelRole | null): boolean {
  return isMember(role);
}

/** Owners and moderators remove other people's channel messages. */
export function canModerate(role: ChannelRole | null): boolean {
  return role === "owner" || role === "moderator";
}

/** Payments and requests need exactly one other person to pay or ask. */
export function allowsMoney(kind: ConversationKind): boolean {
  return kind === "direct";
}

/** Only the owner makes and unmakes moderators. */
export function canChangeRoles(role: ChannelRole | null): boolean {
  return role === "owner";
}

/** A channel always has its owner: everyone else may leave. */
export function canLeave(role: ChannelRole | null): boolean {
  return isMember(role) && role !== "owner";
}

/**
 * Whether the viewer may delete a channel message, and how it then reads:
 * authors delete their own ("Message deleted"), owners and moderators
 * anyone's ("Message removed by a moderator"). Null: they may not.
 */
export function removalBy(
  role: ChannelRole | null,
  isAuthor: boolean
): "author" | "moderator" | null {
  if (isAuthor) return "author";
  return canModerate(role) ? "moderator" : null;
}
