// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { messagesState } from "../../slices/messagesSlice";
import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import { IConversation } from "../../types/Message";
import {
  at,
  CONVERSATION_ID,
  conversation,
  message,
  paymentRequest,
  sarah,
  viewer,
} from "./testFixtures";

const api = vi.hoisted(() => ({ listConversations: vi.fn() }));
vi.mock("../../lib/client/messagesApi", () => ({ messagesApi: api }));

const { default: Inbox } = await import("./Inbox");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const marco = { username: "devmarco", fullname: "Marco Rossi", image: null };
const conversations: IConversation[] = [
  conversation({
    lastMessage: message("m1", sarah, at("07:00"), {
      type: "request",
      request: paymentRequest(),
    }),
    unread: 1,
  }),
  conversation({
    id: "dm-devmarco-illlhanozkan",
    other: marco,
    lastMessage: message("m2", viewer, at("06:00"), "Anytime! 🙌"),
    updatedAt: at("06:00"),
  }),
];

function renderInbox(
  items: IConversation[] | null,
  {
    selectedId = null,
    features = featuresWith("messages"),
  }: { selectedId?: string | null; features?: IFeatures } = {}
) {
  return renderWithStore(
    <Inbox as="page" poll={false} selectedId={selectedId} />,
    {
      state: {
        session: sessionState({ viewer, readOnly: false, features }),
        messages: messagesState(items),
      },
    }
  );
}

const rows = () =>
  within(screen.getByRole("region", { name: "Conversations" })).getAllByRole(
    "link"
  );

describe("Inbox", () => {
  it("lists conversations with a preview, unread ones marked", () => {
    renderInbox(conversations);
    expect(
      screen.getByRole("heading", { level: 1, name: "Messages" })
    ).toBeTruthy();
    const [first, second] = rows();
    expect(first.getAttribute("href")).toBe(`/messages/${CONVERSATION_ID}`);
    expect(first.textContent).toContain("Sarah Chen");
    expect(first.textContent).toContain("💸 Requested 4.50 credits");
    expect(within(first).getByText(", unread")).toBeTruthy();
    expect(second.textContent).toContain("You: Anytime! 🙌");
    expect(second.textContent).not.toContain("unread");
  });

  it("marks the conversation shown beside it", () => {
    renderInbox(conversations, { selectedId: CONVERSATION_ID });
    expect(rows()[0].getAttribute("aria-current")).toBe("page");
    expect(rows()[1].getAttribute("aria-current")).toBeNull();
  });

  it("welcomes an empty inbox with New message", async () => {
    const user = userEvent.setup();
    const { store } = renderInbox([]);
    expect(
      screen.getByRole("heading", { name: "Welcome to your inbox!" })
    ).toBeTruthy();
    await user.click(
      within(screen.getByRole("region", { name: "Conversations" })).getByRole(
        "button",
        { name: "New message" }
      )
    );
    expect(store.getState().ui.dialog).toBe("newMessage");
  });

  it("offers Retry when the inbox couldn't be read", async () => {
    const user = userEvent.setup();
    api.listConversations.mockResolvedValue({ items: conversations });
    renderInbox(null);
    expect(screen.getByRole("alert").textContent).toContain(
      "Your conversations can’t be loaded."
    );
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(rows()).toHaveLength(2));
  });

  it("links to Channels while that feature is on", () => {
    renderInbox(conversations);
    expect(screen.queryByRole("link", { name: "Channels" })).toBeNull();
    cleanup();
    renderInbox(conversations, {
      features: featuresWith("messages", "channels"),
    });
    expect(
      screen.getByRole("link", { name: "Channels" }).getAttribute("href")
    ).toBe("/channels");
  });
});
