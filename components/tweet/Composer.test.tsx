// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";

import { makeStore } from "../../store";
import Composer from "./Composer";

const viewer = { username: "me", fullname: "Me Myself", image: null };

function renderComposer(readOnly = false) {
  const store = makeStore({ session: { viewer, readOnly } });
  render(
    <Provider store={store}>
      <Composer />
    </Provider>
  );
  return store;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Composer", () => {
  it("enables Tweet only for non-empty text within the limit", async () => {
    renderComposer();
    const user = userEvent.setup();
    const box = screen.getByLabelText("Tweet text");
    const button = screen.getByRole("button", { name: "Tweet" });

    expect(button).toHaveProperty("disabled", true);
    await user.type(box, "   ");
    expect(button).toHaveProperty("disabled", true);

    await user.type(box, "hello");
    expect(button).toHaveProperty("disabled", false);
    // The number only appears near the limit.
    expect(screen.queryByText("275")).toBeNull();

    await user.clear(box);
    await user.click(box);
    await user.paste("x".repeat(281));
    expect(button).toHaveProperty("disabled", true);
    expect(screen.getByText("-1")).toBeTruthy();
    expect(screen.getByText("-1 characters left")).toBeTruthy();
  });

  it("posts the trimmed text, then clears the box", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            tweet: {
              id: "t1",
              text: "hello",
              image: null,
              createdAt: new Date().toISOString(),
              author: viewer,
              stats: { replies: 0, retweets: 0, likes: 0 },
              viewer: { liked: false, retweeted: false, bookmarked: false },
            },
          }),
          { status: 201 }
        )
    );
    vi.stubGlobal("fetch", fetch);
    renderComposer();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Tweet text"), "  hello  ");
    await user.click(screen.getByRole("button", { name: "Tweet" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Tweet text")).toHaveProperty("value", "")
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/tweets",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "hello", image: null }),
      })
    );
  });

  it("keeps the text and shows the server's message when posting fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "rate_limited",
                message: "Too many requests, slow down",
                requestId: "r",
              },
            }),
            { status: 429 }
          )
      )
    );
    renderComposer();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Tweet text"), "hello");
    await user.click(screen.getByRole("button", { name: "Tweet" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Too many requests, slow down"
    );
    expect(screen.getByLabelText("Tweet text")).toHaveProperty(
      "value",
      "hello"
    );
  });

  it("sends with Ctrl+Enter", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "x", message: "nope", requestId: "r" },
          }),
          { status: 400 }
        )
    );
    vi.stubGlobal("fetch", fetch);
    renderComposer();
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText("Tweet text"),
      "hello{Control>}{Enter}{/Control}"
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("is hidden in read-only mode", () => {
    renderComposer(true);
    expect(screen.queryByLabelText("Tweet text")).toBeNull();
  });
});
