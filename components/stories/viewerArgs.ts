import { IStoryTrayItem } from "../../types/Story";

// The viewer is a global dialog (StoryDialogs), opened with string arguments
// in ui.dialogArgs. Usernames never contain commas, so a list is joined.

/** What the viewer plays: accounts in order, which one to open, and where in it to start. */
export interface ViewerArgs {
  authors: string[];
  /** Index into `authors` of the account opened first. */
  start: number;
  /** The story to open on; otherwise the account's first unseen, else its first. */
  story: string | null;
}

export function viewerArgs(
  authors: string[],
  { from, story }: { from?: string; story?: string | null } = {}
): Record<string, string> {
  return {
    authors: authors.join(","),
    ...(from ? { from } : {}),
    ...(story ? { story } : {}),
  };
}

export function parseViewerArgs(
  args: Record<string, string> | null
): ViewerArgs | null {
  const authors = (args?.authors ?? "").split(",").filter(Boolean);
  if (authors.length === 0) return null;
  const from = (args?.from ?? "").toLowerCase();
  const start = authors.findIndex((author) => author.toLowerCase() === from);
  return { authors, start: Math.max(start, 0), story: args?.story || null };
}

/**
 * The stories of a tray item this viewer hasn't watched: those the server
 * counts as unseen, minus those watched on this device since the tray loaded.
 */
export function unseenIds(
  item: IStoryTrayItem,
  seen: Record<string, true>
): string[] {
  return item.unseenIds.filter((id) => !seen[id]);
}
