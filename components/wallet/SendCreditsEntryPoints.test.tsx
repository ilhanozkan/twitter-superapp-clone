// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IFeatures } from "../../types/Superapp";
import { IUserProfile } from "../../types/User";
import TweetMenu from "../tweet/TweetMenu";
import SendCreditsProfileAction from "./SendCreditsProfileAction";
import { ok, sarah, stubApi, tweet, walletState } from "./testing";
import WalletDialogs from "./WalletDialogs";

// "Send credits" from a profile and from a Tweet's "…" menu: both open Send
// with the To step locked on that person.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const profile = (overrides: Partial<IUserProfile> = {}): IUserProfile => ({
  ...sarah,
  bio: null,
  location: null,
  website: null,
  banner: null,
  verified: false,
  joinedAt: "2024-01-01T00:00:00.000Z",
  accountType: "personal",
  tweetCount: 3,
  ...overrides,
});

const sarahsTweet = tweet({ id: "seed-t02", author: sarah });

function session({
  readOnly = false,
  features = featuresWith("wallet"),
}: { readOnly?: boolean; features?: IFeatures } = {}) {
  return sessionState({ viewer: testViewer, readOnly, features });
}

const SENDS_TO_SARAH = { to: "sarahcodes", name: "Sarah Chen" };

describe("SendCreditsProfileAction", () => {
  it("opens Send for the person whose profile it is", async () => {
    const { store } = renderWithStore(
      <SendCreditsProfileAction user={profile()} />,
      { state: { session: session() } }
    );
    const button = screen.getByRole("button", {
      name: "Send credits to @sarahcodes",
    });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");

    await userEvent.setup().click(button);
    expect(store.getState().ui.dialog).toBe("send");
    expect(store.getState().ui.dialogArgs).toEqual(SENDS_TO_SARAH);
  });

  it("is not on your own profile, a read-only demo, or with the wallet off", () => {
    for (const [user, state] of [
      [profile({ ...testViewer, username: "IlllhanOzkan" }), session()],
      [profile(), session({ readOnly: true })],
      [profile(), session({ features: featuresWith() })],
    ] as const) {
      const { container } = renderWithStore(
        <SendCreditsProfileAction user={user} />,
        { state: { session: state } }
      );
      expect(container.innerHTML).toBe("");
      cleanup();
    }
  });
});

describe("the Tweet menu's wallet item", () => {
  async function openMenu() {
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "More options" }));
    return within(screen.getByRole("menu"));
  }

  it("offers Send credits on someone else's Tweet", async () => {
    stubApi({
      "GET /api/wallet/activity": ok({ items: [], nextCursor: null }),
    });
    const { store } = renderWithStore(
      <>
        <TweetMenu tweet={sarahsTweet} />
        <WalletDialogs />
      </>,
      { state: { session: session(), wallet: walletState() } }
    );

    const menu = await openMenu();
    const item = menu.getByRole("menuitem", {
      name: "Send credits to @sarahcodes",
    });
    await userEvent.setup().click(item);
    expect(store.getState().ui.dialogArgs).toEqual(SENDS_TO_SARAH);

    // Straight to the amount, for Sarah only.
    const send = screen.getByRole("dialog", { name: "Send credits" });
    expect(within(send).getByText("@sarahcodes")).toBeTruthy();
    expect(within(send).queryByRole("combobox")).toBeNull();
  });

  it("adds nothing to your own Tweets", async () => {
    renderWithStore(<TweetMenu tweet={tweet({ author: testViewer })} />, {
      state: { session: session() },
    });
    const menu = await openMenu();
    expect(
      menu.getAllByRole("menuitem").map((item) => item.textContent)
    ).toEqual(["Delete"]);
  });

  it("is hidden on a read-only demo and while the wallet is off", () => {
    for (const state of [
      session({ readOnly: true }),
      session({ features: featuresWith() }),
    ]) {
      renderWithStore(<TweetMenu tweet={sarahsTweet} />, {
        state: { session: state },
      });
      // A menu with no items isn't shown at all.
      expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
      cleanup();
    }
  });
});
