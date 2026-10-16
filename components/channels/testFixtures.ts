// Builders for the channels component tests (not shipped in any page).
import { channelsState } from "../../slices/channelsSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith } from "../../test/render";
import { ChannelRole, IChannel, IMessage } from "../../types/Message";
import { IAuthor } from "../../types/User";
import { at, page, sarah, viewer } from "../messages/testFixtures";

export { at, page, sarah, viewer };

export const marco: IAuthor = {
  username: "devmarco",
  fullname: "Marco Rossi",
  image: null,
};
export const owner: IAuthor = {
  username: "foodie_ankara",
  fullname: "Mert Demir",
  image: null,
};

export const HANDLE = "ankara_eats";

/**
 * A getByText matcher for text split across child elements (getByText
 * alone reads an element's own text nodes): the innermost element whose
 * whole text is `text`.
 */
export const fullText =
  (text: string) => (_content: string, element: Element | null) =>
    element?.textContent === text &&
    ![...element.children].some((child) => child.textContent === text);

export function channel(
  role: ChannelRole | null,
  overrides: Partial<IChannel> = {}
): IChannel {
  return {
    id: `channel-${HANDLE}`,
    kind: "channel",
    handle: HANDLE,
    name: "Ankara eats",
    description: "Favourite spots around Ankara.",
    owner,
    memberCount: 4,
    lastMessage: null,
    createdAt: at("06:00"),
    viewer: { role, unread: 0 },
    ...overrides,
  };
}

export function channelMessage(
  id: string,
  author: IAuthor,
  createdAt: string,
  text: string
): IMessage {
  return {
    id,
    conversationId: `channel-${HANDLE}`,
    author,
    createdAt,
    body: { type: "text", text, tweet: null, story: null },
  };
}

/** Store state with one open channel, as its page's server render leaves it. */
export function channelPageState({
  open,
  messages = [],
  readOnly = false,
}: {
  open: IChannel;
  messages?: IMessage[];
  readOnly?: boolean;
}) {
  return {
    session: sessionState({
      viewer,
      readOnly,
      features: featuresWith("messages", "channels"),
    }),
    channels: channelsState({
      mine: open.viewer.role ? [open] : [],
      thread: { channel: open, page: page(messages) },
    }),
  };
}
