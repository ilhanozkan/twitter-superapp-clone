import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

// A small Markdown link checker for the repository's docs: every relative
// link and image must point at a file that exists, and every #anchor into a
// Markdown file must match one of its headings the way GitHub names them.
// It reads only what the docs use (inline links and images, reference
// definitions, <img>/<a> tags, ATX and setext headings) and skips code.

export interface MarkdownLink {
  line: number;
  target: string;
}

export interface LinkProblem {
  file: string;
  line: number;
  target: string;
  problem: string;
}

/** What the checker needs from the file system, so tests can pass fixtures. */
export interface DocsFiles {
  /** A file's text, or undefined when there is no such file. */
  read(file: string): string | undefined;
  exists(file: string): boolean;
}

// GitHub's rule (github-slugger, after html-pipeline's TOC filter): lower
// case, drop everything but letters, marks, digits, connector punctuation,
// spaces and hyphens, then turn each space into a hyphen.
const NOT_SLUG = /[^\p{Alphabetic}\p{M}\p{Nd}\p{Pc}\p{Join_Control} -]/gu;

export function githubSlug(text: string): string {
  return text.toLowerCase().replace(NOT_SLUG, "").replace(/ /g, "-");
}

const FENCE = /^\s*(`{3,}|~{3,})/;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT_UNDERLINE = /^ {0,3}(?:=+|-+)[ \t]*$/;
const NOT_PARAGRAPH = /^(?: {4}|\s*(?:[#>|]|[-*+]\s|\d+[.)]\s))/;
const CODE_SPAN = /(`+)([\s\S]*?[^`])\1(?!`)/g;
// [text](target "title") and ![alt](src), with one level of nested brackets
// so a linked image counts too.
const INLINE_LINK =
  /!?\[((?:[^[\]]|\[[^[\]]*\])*)\]\(\s*(<[^>]*>|[^\s()]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
const HTML_LINK =
  /<(?:a|img|source)\b[^>]*?\s(?:href|src)\s*=\s*("[^"]*"|'[^']*')/gi;
const HTML_ID = /<[a-z][^>]*?\s(?:id|name)\s*=\s*("[^"]*"|'[^']*')/gi;

const unquote = (value: string) => value.slice(1, -1);

/** The lines of a Markdown file outside fenced code blocks, with their numbers. */
function proseLines(markdown: string): { text: string; line: number }[] {
  const lines: { text: string; line: number }[] = [];
  let fence: string | null = null;

  markdown.split(/\r?\n/).forEach((text, index) => {
    const marker = FENCE.exec(text)?.[1];
    if (fence) {
      if (
        marker?.[0] === fence[0] &&
        marker.length >= fence.length &&
        text.trim() === marker
      ) {
        fence = null;
      }
      return;
    }
    if (marker) {
      fence = marker;
      return;
    }
    lines.push({ text, line: index + 1 });
  });
  return lines;
}

/** Every link and image target in a Markdown file, code excluded. */
export function markdownLinks(markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];

  const scan = (text: string, line: number) => {
    for (const match of text.matchAll(INLINE_LINK)) {
      const target = match[2];
      links.push({
        line,
        target: target.startsWith("<") ? unquote(target) : target,
      });
      scan(match[1], line);
    }
  };

  for (const { text, line } of proseLines(markdown)) {
    const prose = text.replace(CODE_SPAN, "code");
    scan(prose, line);

    const definition = REFERENCE_DEFINITION.exec(prose)?.[1];
    if (definition) {
      links.push({
        line,
        target: definition.startsWith("<") ? unquote(definition) : definition,
      });
    }
    for (const match of prose.matchAll(HTML_LINK)) {
      links.push({ line, target: unquote(match[1]) });
    }
  }
  return links;
}

/** A heading's text as GitHub renders it: no Markdown syntax or HTML tags. */
function headingText(source: string): string {
  return source
    .split(CODE_SPAN)
    .map((part, index) => {
      // split() with two groups yields [prose, ticks, code, prose, …].
      if (index % 3 === 2) return part;
      if (index % 3 === 1) return "";
      return part
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/<[^>]+>/g, "")
        .replace(/(\*{1,3}|~~)(\S(?:.*?\S)?)\1/g, "$2")
        .replace(/(^|\W)(_{1,3})(\S(?:.*?\S)?)\2(?=\W|$)/g, "$1$3");
    })
    .join("")
    .trim();
}

/** The anchors GitHub gives a Markdown file: one per heading, plus HTML ids. */
export function markdownAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();
  const occurrences = new Map<string, number>();

  const addHeading = (text: string) => {
    const original = githubSlug(headingText(text));
    let slug = original;
    while (occurrences.has(slug)) {
      const count = occurrences.get(original)! + 1;
      occurrences.set(original, count);
      slug = `${original}-${count}`;
    }
    occurrences.set(slug, 0);
    anchors.add(slug);
  };

  const lines = proseLines(markdown);
  lines.forEach(({ text, line }, index) => {
    const atx = ATX_HEADING.exec(text);
    if (atx) {
      addHeading(atx[2] ?? "");
    } else if (SETEXT_UNDERLINE.test(text) && index > 0) {
      const previous = lines[index - 1];
      if (
        previous.line === line - 1 &&
        previous.text.trim() !== "" &&
        !ATX_HEADING.test(previous.text) &&
        !NOT_PARAGRAPH.test(previous.text)
      ) {
        addHeading(previous.text);
      }
    }
    for (const match of text.matchAll(HTML_ID)) {
      anchors.add(unquote(match[1]));
    }
  });
  return anchors;
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export interface LinkChecker {
  /** Why `target`, linked from `from`, is broken; null when it resolves. */
  check(from: string, target: string): string | null;
  /** Every broken link in these Markdown files (paths from the root). */
  checkFiles(files: readonly string[]): LinkProblem[];
}

/**
 * Links resolve against the repository root. Links to `ownRepositoryUrl`'s
 * blob/ and tree/ pages are checked as files in the repository too.
 */
export function createLinkChecker(
  docs: DocsFiles,
  ownRepositoryUrl?: string
): LinkChecker {
  const anchorsOf = new Map<string, Set<string>>();
  const anchors = (file: string) => {
    if (!anchorsOf.has(file)) {
      anchorsOf.set(file, markdownAnchors(docs.read(file) ?? ""));
    }
    return anchorsOf.get(file)!;
  };
  const ownPrefix = ownRepositoryUrl
    ? new RegExp(`^${escapeRegExp(ownRepositoryUrl)}/(?:blob|tree)/[^/]+/`)
    : null;

  function check(from: string, raw: string): string | null {
    let target = raw;
    if (ownPrefix?.test(target)) target = `/${target.replace(ownPrefix, "")}`;
    else if (EXTERNAL.test(target)) return null;

    const hash = target.indexOf("#");
    const pathPart = (hash === -1 ? target : target.slice(0, hash)).replace(
      /\?.*$/,
      ""
    );
    const anchor = hash === -1 ? null : safeDecode(target.slice(hash + 1));

    let file = from;
    if (pathPart) {
      const decoded = safeDecode(pathPart);
      if (decoded === null) return "the path is not valid URL encoding";
      const joined = decoded.startsWith("/")
        ? path.posix.normalize(decoded.slice(1))
        : path.posix.join(path.posix.dirname(from), decoded);
      file = joined.replace(/\/$/, "") || ".";
      if (file === ".." || file.startsWith("../")) {
        return "it points outside the repository";
      }
      if (!docs.exists(file)) return `${file} does not exist`;
    }

    if (anchor === null || !/\.md$/i.test(file)) return null;
    if (!anchor) return "the #anchor is empty";
    return anchors(file).has(anchor)
      ? null
      : `${file} has no heading for #${anchor}`;
  }

  return {
    check,
    checkFiles(files) {
      const problems: LinkProblem[] = [];
      for (const file of files) {
        const markdown = docs.read(file);
        if (markdown === undefined) {
          problems.push({
            file,
            line: 0,
            target: file,
            problem: "no such file",
          });
          continue;
        }
        for (const { line, target } of markdownLinks(markdown)) {
          const problem = check(file, target);
          if (problem) problems.push({ file, line, target, problem });
        }
      }
      return problems;
    },
  };
}

/** `/blob/<branch>/<path>#anchor` links to this repository in source files. */
export function repositoryLinksIn(
  source: string,
  ownRepositoryUrl: string
): string[] {
  const pattern = new RegExp(
    `(?:${escapeRegExp(ownRepositoryUrl)}|\\$\\{REPOSITORY_URL\\})(/(?:blob|tree)/[^/\\s]+/[^\\s\`'")]+)`,
    "g"
  );
  return [...source.matchAll(pattern)].map(
    (match) => `${ownRepositoryUrl}${match[1]}`
  );
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The repository's files, read from disk under `root`. */
export function repositoryFiles(root: string): DocsFiles {
  return {
    read(file) {
      try {
        return readFileSync(path.join(root, file), "utf8");
      } catch {
        return undefined;
      }
    },
    exists(file) {
      try {
        statSync(path.join(root, file));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Files under `dir` (relative to `root`) whose names match `pattern`. */
export function filesUnder(
  root: string,
  dir: string,
  pattern: RegExp
): string[] {
  return readdirSync(path.join(root, dir), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .map((entry) =>
      path.posix.join(
        path.relative(root, entry.parentPath).split(path.sep).join("/"),
        entry.name
      )
    )
    .sort();
}
