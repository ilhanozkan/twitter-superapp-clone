// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { sessionState } from "../../slices/sessionSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import { IUserProfile } from "../../types/User";
import MessageProfileAction from "./MessageProfileAction";

afterEach(cleanup);

const profile = (username: string, fullname: string): IUserProfile => ({
  username,
  fullname,
  image: null,
  bio: null,
  location: null,
  website: null,
  banner: null,
  verified: false,
  joinedAt: "2020-06-01T00:00:00.000Z",
  accountType: "personal",
  tweetCount: 0,
});

function renderAction(user: IUserProfile, on = true) {
  return renderWithStore(<MessageProfileAction user={user} />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly: false,
        features: on ? featuresWith("messages") : featuresWith(),
      }),
    },
  });
}

describe("MessageProfileAction", () => {
  it("links to the conversation (or a draft) with the person", () => {
    renderAction(profile("sarahcodes", "Sarah Chen"));
    expect(
      screen
        .getByRole("link", { name: "Message Sarah Chen" })
        .getAttribute("href")
    ).toBe("/messages?to=sarahcodes");
  });

  it("isn't on your own profile, or while Messages is off", () => {
    renderAction(profile("IlllhanOzkan", "Ilhan Ozkan"));
    expect(screen.queryByRole("link")).toBeNull();
    cleanup();
    renderAction(profile("sarahcodes", "Sarah Chen"), false);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
