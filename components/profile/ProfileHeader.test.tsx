// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IBusiness } from "../../types/Business";
import { IFeatures } from "../../types/Superapp";
import { IUserProfile } from "../../types/User";

// Stand-ins for the lanes' slots, to see what the header hands them.
vi.mock("../shop/OrderButton", () => ({
  default: ({ business }: { business: IBusiness }) => (
    <button type="button">Order from {business.username}</button>
  ),
}));
vi.mock("../shop/BusinessInfo", () => ({
  default: ({ business }: { business: IBusiness }) => (
    <p>{business.status.label}</p>
  ),
}));
vi.mock("../rides/RideHereLink", () => ({
  default: ({ placeId }: { placeId: string }) => (
    <a href={`/rides?to=${placeId}`}>Ride here</a>
  ),
}));
vi.mock("../messages/MessageProfileAction", () => ({
  default: ({ user }: { user: IUserProfile }) => (
    <a href={`/messages?to=${user.username}`}>Message</a>
  ),
}));
vi.mock("../wallet/SendCreditsProfileAction", () => ({
  default: () => <button type="button">Send credits</button>,
}));

const { default: ProfileHeader } = await import("./ProfileHeader");

const user = (accountType: "personal" | "business"): IUserProfile => ({
  username: "kizilaykahve",
  fullname: "Kızılay Kahve",
  image: null,
  bio: null,
  location: null,
  website: null,
  banner: null,
  verified: false,
  joinedAt: "2024-01-01T00:00:00.000Z",
  accountType,
  tweetCount: 3,
});

const business = {
  username: "kizilaykahve",
  category: "cafe",
  placeId: "kizilay",
  status: { label: "Open 24 hours" },
} as unknown as IBusiness;

function renderHeader(
  profile: IUserProfile,
  biz: IBusiness | null,
  features: IFeatures = featuresWith()
) {
  renderWithStore(
    <ProfileHeader user={profile} business={biz} tab="tweets" />,
    {
      state: {
        session: sessionState({
          viewer: testViewer,
          readOnly: false,
          features,
        }),
      },
    }
  );
}

const tabs = () =>
  within(screen.getByRole("navigation", { name: "Profile timelines" }))
    .getAllByRole("link")
    .map((link) => link.textContent);

afterEach(() => {
  cleanup();
});

describe("ProfileHeader", () => {
  it("labels a business with text and an icon, never a badge", () => {
    renderHeader(user("business"), business);
    expect(screen.getByText("Business · Café")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /verified/i })).toBeNull();
  });

  it("hands the business to the lanes' slots", () => {
    renderHeader(user("business"), business);
    expect(
      screen.getByRole("button", { name: "Order from kizilaykahve" })
    ).toBeTruthy();
    expect(screen.getByText("Open 24 hours")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Ride here" }).getAttribute("href")
    ).toBe("/rides?to=kizilay");
    expect(screen.getByRole("link", { name: "Message" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send credits" })).toBeTruthy();
  });

  it("gives people only Message and Send credits", () => {
    renderHeader(user("personal"), null);
    expect(screen.queryByText(/Business/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Order/ })).toBeNull();
    expect(screen.queryByRole("link", { name: "Ride here" })).toBeNull();
    expect(screen.getByRole("link", { name: "Message" })).toBeTruthy();
  });

  it("adds the Menu tab for businesses only while the shop is on", () => {
    renderHeader(user("business"), business, featuresWith("shop"));
    expect(tabs()).toEqual(["Tweets", "Menu", "Likes"]);
    cleanup();

    renderHeader(user("business"), business);
    expect(tabs()).toEqual(["Tweets", "Likes"]);
    cleanup();

    renderHeader(user("personal"), null, featuresWith("shop"));
    expect(tabs()).toEqual(["Tweets", "Likes"]);
  });
});
