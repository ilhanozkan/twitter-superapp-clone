// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  screen,
  within,
} from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { contrastRatio } from "../../lib/superapp/contrast";
import { sessionState } from "../../slices/sessionSlice";
import { openDialog } from "../../slices/uiSlice";
import { featuresWith, renderWithStore, testViewer } from "../../test/render";
import StoryDialogs from "./StoryDialogs";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Reply = { status: number; body?: unknown };

/** Answers POST /api/stories with `reply` and records the bodies. */
function stubCreate(
  reply: Reply = {
    status: 201,
    body: { story: { id: "story-new-1" } },
  }
) {
  const bodies: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path: string, init: RequestInit = {}) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json(reply.body, { status: reply.status });
    })
  );
  return bodies;
}

function openComposer() {
  const result = renderWithStore(<StoryDialogs />, {
    state: {
      session: sessionState({
        viewer: testViewer,
        readOnly: false,
        features: featuresWith("stories"),
      }),
    },
  });
  act(() => {
    result.store.dispatch(openDialog("storyComposer"));
  });
  return {
    ...result,
    dialog: screen.getByRole("dialog", { name: "Add to your story" }),
  };
}

const css = readFileSync(
  path.join(__dirname, "../../styles/globals.css"),
  "utf8"
);

/** The theme tokens ("r g b") declared in the CSS block that starts with `selector`. */
function themeTokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries(
    [...block.matchAll(/--color-([a-z-]+):\s*([\d\s]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ])
  );
}

const share = () =>
  fireEvent.click(screen.getByRole("button", { name: "Share to your story" }));
const preview = (dialog: HTMLElement) =>
  dialog.querySelector("[aria-hidden='true'] [style]") as HTMLElement;

describe("StoryComposerDialog", () => {
  it("previews a text story live on the chosen background", () => {
    const { dialog } = openComposer();
    const field = screen.getByLabelText("Story text");
    expect(document.activeElement).toBe(field);

    fireEvent.change(field, { target: { value: "Shipping today" } });
    expect(preview(dialog).textContent).toBe("Shipping today");
    expect(preview(dialog).getAttribute("data-background")).toBe("blue");

    const backgrounds = within(
      screen.getByRole("group", { name: "Background" })
    ).getAllByRole("radio");
    expect(backgrounds.map((radio) => radio.getAttribute("value"))).toEqual([
      "blue",
      "purple",
      "green",
      "orange",
      "pink",
      "slate",
    ]);
    fireEvent.click(screen.getByRole("radio", { name: "Purple" }));
    expect(preview(dialog).getAttribute("data-background")).toBe("purple");
    expect(preview(dialog).style.backgroundColor).toBe("rgb(109, 40, 217)");
  });

  it("edges every background swatch at 3:1 or more on the dialog in both themes", () => {
    const { dialog } = openComposer();
    const themes = {
      light: themeTokens(":root {"),
      dark: themeTokens(':root[data-theme="dark"]'),
    };
    const radios = within(
      within(dialog).getByRole("group", { name: "Background" })
    ).getAllByRole("radio");
    expect(radios).toHaveLength(6);
    for (const radio of radios) {
      // The disc is the option's only visible part (its name is sr-only).
      const disc = radio.parentElement!.querySelector(
        "[aria-hidden='true']"
      ) as HTMLElement;
      const edge = /(?:^|\s)border-([a-z][a-z-]*)(?=\s|$)/.exec(
        disc.className
      )?.[1];
      for (const [theme, colors] of Object.entries(themes)) {
        expect(colors[edge ?? ""], `${theme} border-${edge}`).toBeDefined();
        expect(
          contrastRatio(colors[edge!], colors.surface),
          `${radio.getAttribute("value")} in ${theme}`
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("counts characters and refuses more than 200", () => {
    const bodies = stubCreate();
    openComposer();
    const field = screen.getByLabelText("Story text");

    fireEvent.change(field, { target: { value: "x".repeat(190) } });
    expect(screen.getByText("190/200")).toBeTruthy();
    expect(screen.getByText("10 characters left")).toBeTruthy();

    fireEvent.change(field, { target: { value: "x".repeat(201) } });
    share();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Use at most 200 characters.")).toBeTruthy();
    expect(bodies).toEqual([]);
  });

  it("requires alt text on a photo and puts focus on it", () => {
    const bodies = stubCreate();
    openComposer();
    fireEvent.click(screen.getByRole("tab", { name: "Photo" }));
    expect(
      screen.getByRole("tab", { name: "Photo" }).getAttribute("aria-selected")
    ).toBe("true");

    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "/media/coffee.svg" },
    });
    share();

    const alt = screen.getByLabelText("Alt text");
    expect(document.activeElement).toBe(alt);
    expect(alt.getAttribute("aria-invalid")).toBe("true");
    expect(alt.getAttribute("aria-required")).toBe("true");
    expect(alt.getAttribute("aria-describedby")).toContain(
      document.querySelector("[id$='-alt-hint']")!.id
    );
    expect(
      screen.getByText(
        "Alt text is required. Describe the photo for people who can’t see it."
      )
    ).toBeTruthy();
    expect(
      screen.getByText("Describe this photo for people who use screen readers.")
    ).toBeTruthy();
    expect(bodies).toEqual([]);
  });

  it("checks the photo URL as it is typed, like the Tweet composer", () => {
    openComposer();
    fireEvent.click(screen.getByRole("tab", { name: "Photo" }));
    const url = screen.getByLabelText("Image URL");
    fireEvent.change(url, { target: { value: "javascript:alert(1)" } });
    expect(url.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.getByText("Use an https:// URL or a path on this site.")
    ).toBeTruthy();
  });

  it("previews a photo with its alt text and caption, and shares it", async () => {
    const bodies = stubCreate();
    const { dialog, store } = openComposer();
    fireEvent.click(screen.getByRole("tab", { name: "Photo" }));
    fireEvent.change(screen.getByLabelText("Image URL"), {
      target: { value: "/media/coffee.svg" },
    });
    fireEvent.change(screen.getByLabelText("Alt text"), {
      target: { value: "A cup of Turkish coffee" },
    });
    fireEvent.change(screen.getByLabelText("Caption (optional)"), {
      target: { value: "Afternoon fuel" },
    });

    const image = dialog.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("A cup of Turkish coffee");
    expect(within(dialog).getByText("Afternoon fuel")).toBeTruthy();
    expect(screen.getByText("Disappears after 24 hours.")).toBeTruthy();

    share();
    await vi.waitFor(() => expect(store.getState().ui.dialog).toBeNull());
    expect(bodies).toEqual([
      {
        content: {
          type: "image",
          image: "/media/coffee.svg",
          alt: "A cup of Turkish coffee",
          caption: "Afternoon fuel",
        },
      },
    ]);
  });

  it("shares a text story, reloads the tray and links to it", async () => {
    const bodies = stubCreate();
    const { store } = openComposer();
    fireEvent.change(screen.getByLabelText("Story text"), {
      target: { value: "  Hello stories  " },
    });
    fireEvent.click(screen.getByRole("radio", { name: "Green" }));
    share();

    await vi.waitFor(() => expect(store.getState().ui.dialog).toBeNull());
    expect(bodies).toEqual([
      { content: { type: "text", text: "Hello stories", background: "green" } },
    ]);
    expect(store.getState().stories.trayVersion).toBe(1);
    expect(store.getState().ui.toasts).toMatchObject([
      {
        message: "Your story was shared.",
        action: {
          label: "View",
          href: "/stories/illlhanozkan?story=story-new-1",
        },
      },
    ]);
  });

  it("shows why the server refused it, e.g. the 10-story limit", async () => {
    stubCreate({
      status: 422,
      body: {
        error: {
          code: "limit_exceeded",
          message: "You can have at most 10 active stories.",
        },
      },
    });
    const { store } = openComposer();
    fireEvent.change(screen.getByLabelText("Story text"), {
      target: { value: "One more" },
    });
    share();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "You can have at most 10 active stories."
    );
    expect(store.getState().ui.dialog).toBe("storyComposer");
  });

  it("moves between Text and Photo with the arrow keys", () => {
    openComposer();
    const textTab = screen.getByRole("tab", { name: "Text" });
    textTab.focus();
    fireEvent.keyDown(textTab, { key: "ArrowRight" });
    const photo = screen.getByRole("tab", { name: "Photo" });
    expect(document.activeElement).toBe(photo);
    expect(photo.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel", { name: "Photo" })).toBeTruthy();
    fireEvent.keyDown(photo, { key: "ArrowRight" });
    expect(document.activeElement).toBe(textTab);
  });
});
