import { IStory } from "../../../types/Story";

// Who may act on a story. Anyone can watch a visible story; only its author
// sees who watched it (everyone else gets 404, so viewer lists reveal
// nothing) and only its author can delete it (others get 403: they can see
// the story, just not delete it).

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function canViewViewers(
  viewer: string,
  story: Pick<IStory, "author">
): boolean {
  return same(viewer, story.author.username);
}

export function canDeleteStory(
  viewer: string,
  story: Pick<IStory, "author">
): boolean {
  return same(viewer, story.author.username);
}
