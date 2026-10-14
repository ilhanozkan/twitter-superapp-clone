// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const { default: Inbox, INBOX_POLL_MS } = await import("./Inbox");

let visibility: DocumentVisibilityState = "visible";
function setVisibility(value: DocumentVisibilityState) {
  visibility = value;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  visibility = "visible";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
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
    poll = false,
  }: { selectedId?: string | null; features?: IFeatures; poll?: boolean } = {}
) {
  return renderWithStore(
    <Inbox as="page" poll={poll} selectedId={selectedId} />,
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

describe("Inbox polling", () => {
  const advance = (ms: number) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });

  it("refreshes every 15 s while visible, pauses while hidden and catches up on return", async () => {
    vi.useFakeTimers();
    const marcoFirst = [conversations[1], conversations[0]];
    api.listConversations.mockResolvedValue({ items: marcoFirst });
    renderInbox(conversations, { poll: true });

    await advance(INBOX_POLL_MS - 1);
    expect(api.listConversations).not.toHaveBeenCalled();
    await advance(1);
    expect(api.listConversations).toHaveBeenCalledTimes(1);
    expect(rows()[0].textContent).toContain("Marco Rossi");

    act(() => setVisibility("hidden"));
    await advance(INBOX_POLL_MS * 4);
    expect(api.listConversations).toHaveBeenCalledTimes(1);

    act(() => setVisibility("visible"));
    await advance(0);
    expect(api.listConversations).toHaveBeenCalledTimes(2);
  });

  it("stays quiet when a refresh fails with rows on screen, and backs off", async () => {
    vi.useFakeTimers();
    api.listConversations.mockRejectedValue(new Error("offline"));
    renderInbox(conversations, { poll: true });

    await advance(INBOX_POLL_MS);
    expect(api.listConversations).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(rows()).toHaveLength(2);

    // The next try waits twice as long.
    await advance(INBOX_POLL_MS * 2 - 1);
    expect(api.listConversations).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(api.listConversations).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
