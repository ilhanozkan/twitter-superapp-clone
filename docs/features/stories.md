# Stories

Short texts and photos that disappear 24 hours after they are posted. They
show in a tray at the top of Home and play in a full-screen viewer. Only the
author sees who watched, and other people can reply in a direct message.

The API is in [docs/api/stories.md](../api/stories.md). How SuperApp
features are built is in [docs/SUPERAPP.md](../SUPERAPP.md).

## Where it lives

| Place                         | What it does                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Home, under the header        | The story tray (`components/stories/StoriesTray.tsx`)                                      |
| Any page                      | The viewer and the composer, global dialogs (`StoryDialogs`, loaded on demand)             |
| Services → Stories            | Opens the composer ("Share a moment for 24 hours")                                         |
| `/stories/<username>?story=…` | A link to someone's stories: it opens the viewer over a page that lists the same stories   |
| A direct message              | A reply to a story, with a preview of it (shown by Messages while the story is still live) |

## The tray

- **Order:** "Your story" first, then accounts with stories you haven't
  seen (most recent poster first), then those you have. At most 50
  accounts.
- **Your story** is two controls: your avatar plays your stories, and the
  "+" button ("Add to your story") opens the composer. With nothing posted,
  the item is a single "Add to your story" button.
- **Names:** every item is a button named like "Mert Demir's stories, 2
  new". The ring is a gradient while there is something new and turns grey
  as soon as you have watched everything, without waiting for the server.
  Items keep their place until the next load, so focus can return to the
  item that opened the viewer.
- **Scrolling:** the list scrolls sideways inside itself (with snap), never
  the page; Tab reaches every item. From 500px, arrow buttons appear for
  mouse users while there is more in that direction.
- After you post or delete a story, the tray reloads itself.

## The viewer

A full-screen dialog. The browser keeps focus inside it, and focus returns
to the tray item that opened it.

- **Header:** avatar and name (a link to the profile), the age ("2h"),
  **Pause/Play** (always visible), the "…" menu with Delete on your own
  stories, and Close.
- **Progress:** one bar per story of the account. The bars are decorative;
  a polite live region says "Story 2 of 3 by Mert Demir, posted 2 hours ago".
- **Canvas:** 9:16. Text stories are white on one of six backgrounds, each
  at least 5:1. Photos are letterboxed on black with their alt text and
  caption; a photo that can't load shows its alt text instead.
- **Moving:**
  - Keys: ← and → go back and forward, Space pauses, Esc closes.
  - From 500px, Previous and Next buttons sit beside the story.
  - On phones, tap the left third to go back and the rest to go forward;
    press and hold to pause. These tap zones are the same named buttons, so
    they stay focusable.
  - After an account's last story the viewer moves on to the next account
    in the tray, and it closes after the last one. Previous on an account's
    first story goes back to the previous account (on the very first story,
    it starts that story again).
- **Auto-advance:** 5 s for text and 6 s for photos (counted from when the
  photo has loaded). It pauses while you hover the story, while the reply
  field has focus, while the tab is hidden, while the "…" menu, the viewers
  list or the delete prompt is open, and while you hold or press Pause; it
  resumes where it stopped. With `prefers-reduced-motion` nothing moves on
  by itself and the bars fill in steps.
- **Your own stories:** "Seen by 3" opens the list of who watched (Esc or
  Close returns to it). Delete asks first, then removes the story for
  everyone.
- **Other people's stories:** "Reply to Mert…" sends a direct message with
  the story attached. It shows only while Messages is on and the demo is
  writable; "View in Messages" opens the conversation.
- **Where it starts:** an account opens on its first story you hadn't
  seen when the viewer opened, otherwise on its first.

### Seen state

Watching a story greys its ring at once. The viewer reports what you
watched to `POST /api/stories/views` in batches of at most 50 ids, every 3
seconds and once more when it closes. Stories the server already counts as
seen are not sent again, and a batch lost to a network error goes with the
next one. On a `READ_ONLY` deployment the server refuses writes, so the
watched ids are kept in `sessionStorage` (`stories:seen:v1`) instead: the
rings stay grey in that tab after a reload, and nothing is sent.

## The composer

"Add to your story", from the tray's "+" or Services.

- **Text:** up to 200 characters with a counter, and a background: Blue
  `#1570c2`, Purple `#6d28d9`, Green `#047857`, Orange `#b45309`, Pink
  `#be185d` or Slate `#334155`.
- **Photo:** an image URL (an `https://` URL or a path on this site, as for
  Tweets), alt text (required, up to 420 characters: "Describe this photo
  for people who use screen readers") and an optional caption (up to 100).
- A live preview shows the story as the viewer will.
- "Disappears after 24 hours." "Share to your story" checks the fields,
  shows each problem next to its field and moves focus to the first one.
  After sharing, a toast links to the new story.

## States

| Surface  | Empty                                        | Loading                  | Error                                                             | READ_ONLY                                                           |
| -------- | -------------------------------------------- | ------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| Tray     | Only "Your story" (Add to your story)        | Rendered on the server   | Home still loads without it                                       | No "+"; hidden when nobody has stories; seen kept in sessionStorage |
| Viewer   | "This story is no longer available"          | A spinner in the canvas  | The error with Retry                                              | No reply field, no Delete; watching works                           |
| Composer | —                                            | "Sharing…" on the button | The server's message, e.g. the 10-story limit                     | Not offered                                                         |
| Link     | "No stories right now" (with a profile link) | Rendered on the server   | "This story is no longer available" when the linked story is gone | Same                                                                |

## Limits

- A story lasts 24 hours. Nothing runs when it expires: every read leaves
  it out from `expiresAt` on.
- At most 10 stories showing per account (422 `limit_exceeded`), and at
  most 10 new stories an hour per user (the `stories` budget, off in e2e).
- Text up to 200 characters, alt text up to 420, captions up to 100.
- The demo's seeded stories disappear 24 hours after the server starts;
  restarting brings them back.

## Try it

On the default memory store (`npm run dev`):

1. Home shows six accounts. Lena Hoffmann's ring is grey: the demo user has
   already seen her story. Your story has one story, seen by three people.
2. Open Mert Demir's stories ("2 new"), move with ← and →, then press Esc:
   his ring is grey and focus is back on it.
3. Open Your story and choose "Seen by 3" to see Sarah, Marco and Twitter
   SuperApp.
4. Press "+", write a text story, pick a background and share it. It plays
   last in Your story; delete it from the "…" menu.
5. With Messages on, reply to Sarah's story from the viewer and follow
   "View in Messages".
6. Run with `READ_ONLY=true`: the "+" is gone, stories still play, and the
   rings you grey stay grey after a reload in the same tab.

## Tests

- `components/stories/*.test.tsx`: the tray (order, names, rings, reload,
  READ_ONLY), the viewer (keys, Pause, auto-advance timing and every pause
  condition with fake timers, reduced motion, batched seen state, focus
  restore, replies, viewers, delete) and the composer (preview, counter,
  alt text, errors, tabs). `seenState.test.ts` covers batching (≤ 50 ids),
  retries and sessionStorage.
- `test/routes/stories.test.ts`: the API and the `/stories/<username>` page.
- `e2e/stories.spec.ts` and `e2e/stories.readonly.spec.ts`: the tray, the
  viewer and the composer in a browser, axe in both themes, the 360px tray,
  and the read-only demo. The reply test runs only while Messages is on.
