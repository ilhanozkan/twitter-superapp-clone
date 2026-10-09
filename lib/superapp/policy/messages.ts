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
