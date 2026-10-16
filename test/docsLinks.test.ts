import { statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { REPOSITORY_URL } from "../components/layout/moreMenuItems";
import { FEATURE_IDS } from "../lib/superapp/features";
import {
  createLinkChecker,
  DocsFiles,
  filesUnder,
  githubSlug,
  markdownAnchors,
  markdownLinks,
  repositoryFiles,
  repositoryLinksIn,
} from "./markdownLinks";

const ROOT = path.join(__dirname, "..");

/** In-memory files; a path ending in "/" is a directory. */
function fixture(files: Record<string, string>): DocsFiles {
  return {
    read: (file) => files[file],
    exists: (file) => file in files || `${file}/` in files,
  };
}

describe("githubSlug", () => {
  it.each([
    ["SuperApp conventions", "superapp-conventions"],
    ["Ledger and holds", "ledger-and-holds"],
    ["POST /api/orders", "post-apiorders"],
    ["GET /api/conversations/:id/messages", "get-apiconversationsidmessages"],
    ["What's new?", "whats-new"],
    ["snake_case and kebab-case", "snake_case-and-kebab-case"],
    ["Rides 🚗 today", "rides--today"],
    ["Kızılay Kahve", "kızılay-kahve"],
  ])("%s → %s", (heading, slug) => {
    expect(githubSlug(heading)).toBe(slug);
  });
});

describe("markdownAnchors", () => {
  it("names headings the way GitHub renders them", () => {
    const anchors = markdownAnchors(
      [
        "# Orders API",
        "## `POST /api/orders`",
        "### The **cart** for [ordering](shop.md)",
        "## Closed heading ##",
        "Setext heading",
        "--------------",
        '<a id="custom-anchor"></a>',
      ].join("\n")
    );
    expect([...anchors].sort()).toEqual([
      "closed-heading",
      "custom-anchor",
      "orders-api",
      "post-apiorders",
      "setext-heading",
      "the-cart-for-ordering",
    ]);
  });

  it("numbers repeated headings", () => {
    const anchors = markdownAnchors("## Objects\n## Objects\n## Objects\n");
    expect([...anchors]).toEqual(["objects", "objects-1", "objects-2"]);
  });

  it("ignores headings in code blocks and lists under a dash line", () => {
    const anchors = markdownAnchors(
      [
        "```sh",
        "# not a heading",
        "```",
        "- a list item",
        "---",
        "| a | b |",
        "| - | - |",
      ].join("\n")
    );
    expect([...anchors]).toEqual([]);
  });
});

describe("markdownLinks", () => {
  it("finds links, images, linked images, HTML and reference definitions", () => {
    const links = markdownLinks(
      [
        "See [the API](docs/API.md#rest-api) and ![a logo](./logo.png).",
        '[![badge](badge.svg)](https://example.com) [x](<a b.md> "title")',
        '<img src="./phone.png" alt="A phone" width="300">',
        "[ref]: ./sanity/README.md",
      ].join("\n")
    );
    expect(links).toEqual([
      { line: 1, target: "docs/API.md#rest-api" },
      { line: 1, target: "./logo.png" },
      { line: 2, target: "https://example.com" },
      { line: 2, target: "badge.svg" },
      { line: 2, target: "a b.md" },
      { line: 3, target: "./phone.png" },
      { line: 4, target: "./sanity/README.md" },
    ]);
  });

  it("skips code", () => {
    const links = markdownLinks(
      [
        "Use `[text](missing.md)` to link.",
        "```md",
        "[inside](a-fence.md)",
        "```",
        "  ```json",
        '  { "href": "[x](y.md)" }',
        "  ```",
        "[after](after.md)",
      ].join("\n")
    );
    expect(links).toEqual([{ line: 8, target: "after.md" }]);
  });
});

describe("createLinkChecker", () => {
  const docs = fixture({
    "README.md": [
      "# Project",
      "![Home](./@readme-images/home.png)",
      "[Docs](./docs/API.md#errors), [Studio](sanity/README.md), [dir](docs/)",
      "[Top](#project) [site](https://example.com) [mail](mailto:a@b.c)",
      "[code](lib/index.ts#L10)",
    ].join("\n"),
    "@readme-images/home.png": "",
    "docs/": "",
    "docs/API.md": "# REST API\n## Errors\n[Back](../README.md#project)",
    "sanity/README.md": "# Studio",
    "lib/index.ts": "",
  });

  it("accepts links that resolve", () => {
    expect(
      createLinkChecker(docs).checkFiles(["README.md", "docs/API.md"])
    ).toEqual([]);
  });

  it("reports every kind of broken link", () => {
    const broken = fixture({
      "README.md": [
        "# Project",
        "![Home](./@readme-images/missing.png)",
        '<img src="./@readme-images/gone.png" alt="">',
        "[Docs](./docs/API.md#no-such-heading) [Gone](docs/gone.md)",
        "[Here](#nowhere) [Empty](docs/API.md#) [Up](../outside.md)",
      ].join("\n"),
      "docs/API.md": "# REST API",
    });

    expect(createLinkChecker(broken).checkFiles(["README.md"])).toEqual([
      {
        file: "README.md",
        line: 2,
        target: "./@readme-images/missing.png",
        problem: "@readme-images/missing.png does not exist",
      },
      {
        file: "README.md",
        line: 3,
        target: "./@readme-images/gone.png",
        problem: "@readme-images/gone.png does not exist",
      },
      {
        file: "README.md",
        line: 4,
        target: "./docs/API.md#no-such-heading",
        problem: "docs/API.md has no heading for #no-such-heading",
      },
      {
        file: "README.md",
        line: 4,
        target: "docs/gone.md",
        problem: "docs/gone.md does not exist",
      },
      {
        file: "README.md",
        line: 5,
        target: "#nowhere",
        problem: "README.md has no heading for #nowhere",
      },
      {
        file: "README.md",
        line: 5,
        target: "docs/API.md#",
        problem: "the #anchor is empty",
      },
      {
        file: "README.md",
        line: 5,
        target: "../outside.md",
        problem: "it points outside the repository",
      },
    ]);
  });

  it("checks links to the repository's own GitHub pages as files", () => {
    const checker = createLinkChecker(docs, "https://github.com/me/repo");
    expect(
      checker.check(
        "pages/services.tsx",
        "https://github.com/me/repo/blob/master/docs/API.md#errors"
      )
    ).toBeNull();
    expect(
      checker.check(
        "pages/services.tsx",
        "https://github.com/me/repo/blob/master/docs/API.md#live"
      )
    ).toBe("docs/API.md has no heading for #live");
    expect(
      checker.check("README.md", "https://github.com/other/repo/blob/x.md")
    ).toBeNull();
  });
});

describe("the repository's docs", () => {
  const files = [
    "README.md",
    "sanity/README.md",
    ...filesUnder(ROOT, "docs", /\.md$/),
    ...filesUnder(ROOT, ".github", /\.md$/),
  ];
  const repo = repositoryFiles(ROOT);
  const checker = createLinkChecker(repo, REPOSITORY_URL);

  it("covers the READMEs and every page under docs/, two per feature", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "README.md",
        "sanity/README.md",
        "docs/API.md",
        "docs/SUPERAPP.md",
        ".github/pull_request_template.md",
        ...FEATURE_IDS.flatMap((id) => [
          `docs/api/${id}.md`,
          `docs/features/${id}.md`,
        ]),
      ])
    );
  });

  it("has no broken relative links, images or anchors", () => {
    expect(checker.checkFiles(files)).toEqual([]);
  });

  it("has the sections the app links to", () => {
    const sources = ["pages", "components", "lib"].flatMap((dir) =>
      filesUnder(ROOT, dir, /^(?!.*\.test\.).*\.tsx?$/)
    );
    const links = sources.flatMap((file) =>
      repositoryLinksIn(repo.read(file) ?? "", REPOSITORY_URL).map(
        (target) => ({ file, target })
      )
    );

    // Services' "On the roadmap" card links to the Live section.
    expect(links).toContainEqual({
      file: "pages/services.tsx",
      target: `${REPOSITORY_URL}/blob/master/docs/SUPERAPP.md#live`,
    });
    expect(
      links
        .map(({ file, target }) => ({
          target,
          problem: checker.check(file, target),
        }))
        .filter(({ problem }) => problem)
    ).toEqual([]);
  });

  it("shows every README screenshot, each under 250 KB", () => {
    const shown = new Set(
      markdownLinks(repo.read("README.md") ?? "").map(({ target }) =>
        path.posix.normalize(target)
      )
    );
    const images = filesUnder(ROOT, "@readme-images", /\.png$/);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) {
      expect(shown, image).toContain(image);
      expect(statSync(path.join(ROOT, image)).size, image).toBeLessThan(
        250 * 1024
      );
    }
  });
});
