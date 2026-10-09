import { SeedData } from "../../seed";
import {
  conversationDocument,
  memberDocument,
  messageDocument,
} from "../messages";
import { SanitySeedDocument } from "./documents";

// Conversations, memberships and messages are private: path ids, so they
// need a token to read or import (see sanity/README.md). Direct messages
// are stored unencrypted, like everything else in the dataset.

export const messagesSanityDocuments: (
  seed: SeedData
) => SanitySeedDocument[] = (seed) => {
  const messages = seed.superapp?.messages;
  if (!messages) return [];

  return [
    ...messages.conversations.map((conversation) => ({
      ...conversationDocument(conversation),
      _createdAt: conversation.createdAt,
    })),
    ...messages.members.map((member) => ({
      ...memberDocument(member),
      _createdAt: member.joinedAt,
    })),
    ...messages.messages.map((message) => ({
      ...messageDocument(message),
      _createdAt: message.createdAt,
    })),
  ];
};
