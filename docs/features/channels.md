# Channels

Public group conversations with roles and moderation. Anyone can read a
channel; members post in it; its owner and moderators can remove messages.
Channels run on the same engine as direct messages, without payments. The
data and endpoints are described in the [channels API](../api/channels.md).

## Where it lives

- **`/channels`.** Reached from the inbox's **Channels** tab (Chats |
  Channels), the Channels tile in Services, and `/channels/<handle>` links.
  Two lists: **Your channels** (the most recently active first) and
  **Discover** (every channel, the biggest first). Each card shows the
  name, `#handle`, member count and description, and **Join** or your part
  in it (Joined, Moderator, Owner); unread messages show as "1 new
  message". "Create channel" (the + in the header) opens a form.
- **`/channels/<handle>`.** Anyone can open it. The header says
  `#ankara_eats` with "Ankara eats · 4 members", **Join** or **Leave** (none
  for the owner) and **Channel info**. On phones it is in focus mode (no tab
  bar; the composer, or the join bar, pinned at the bottom). From 1024px
  "Your channels" sits beside it, like the inbox beside a conversation.

## In a channel

- **Messages** look like a conversation's, with each person's name and
  avatar over their run of messages (yours are on the right, unnamed).
  Mentions, hashtags and links work as in Tweets.
- **Join to send messages** replaces the composer until you join. Joining
  moves focus to the composer; leaving moves it back to Join.
- **Channel info** opens the name, #handle, description and member count,
  then the **Owner**, **Moderators** and **Members**. The owner gets **Make
  moderator** and **Remove moderator** next to each person.
- **Deleting:** a **Delete message** button (a bin) sits next to each
  message you may delete: your own, and everyone's for owners and
  moderators. It is a button rather than a menu so it stays on screen at
  any width. A confirmation says what everyone will see instead: "Message
  deleted" (your own) or "Message removed by a moderator".
- **No payments:** the composer has no credits menu, and the API refuses
  payments and requests in channels.

## Creating a channel

A name (up to 50 characters), a handle (3 to 30 lower-case letters, numbers
or `_`; suggested from the name until you edit it; it can't change later)
and an optional description (up to 160). Each person creates at most 3. A
taken handle is pointed out on the handle field; on success the new channel
opens, with you as its owner.

## Updates

An open channel polls every 4 s while the tab is visible (backing off to
60 s on errors, with "Can't load new messages. Retrying…" after two
failures), reading its newest page so removals show too. Members' unread
messages are marked read while the channel is open and visible, at most
once every 5 s. Channels don't count towards the Messages badge.

## States

| State                  | What you see                                                                                             |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| No channels of yours   | "No channels yet" with Create channel and Discover                                                       |
| No channels at all     | "No channels yet" with Create channel                                                                    |
| A list can't be read   | An alert with Retry                                                                                      |
| An empty channel       | "No messages in #handle yet"                                                                             |
| Not a member           | "Join to send messages" and Join                                                                         |
| A send or delete fails | Text: "Not sent · Retry". Delete: the confirmation stays open with the reason. Join and Leave: a toast   |
| READ_ONLY              | Channels can be read. No Create, Join, Leave or delete; the composer is replaced by the read-only notice |
| Channels off           | The Channels tab and Services tile are hidden; `/channels` pages and every channel API are 404s          |

## Accessibility

- The message list is a `role="log"` named "Messages in #handle", with new
  messages announced politely in batches, as in direct messages. Every
  message starts with its author for screen readers; the visible name over
  a run is decorative.
- Cards are articles named after the channel; the whole card opens it and
  its Join button sits above. Join and Leave name the channel ("Join
  #ankara_eats"); role buttons name the person ("Make moderator: Sarah
  Chen").
- When the control you used goes away, focus moves to what replaced it:
  the composer after joining in a channel, the card's link after joining
  from a card, Join after leaving, the message list after a deletion, and
  the person's new button after a role change.
- The create form's errors are linked to their fields with
  `aria-describedby`, and focus moves to the first field to fix.

## Try it

1. Open Messages → **Channels**, then **Discover**, and **Join**
   #ankara_eats.
2. Open it and say something; then **Leave**: your message stays.
3. In #superapp_builders you are a moderator: press **Delete message** next
   to Marco's off-topic message and confirm. Everyone now sees "Message
   removed by a moderator".
4. **Create channel**, then open **Channel info**: you are its owner.
5. As @superapp (`DEMO_USERNAME=superapp`), open #superapp_builders' info
   and make someone a moderator.

## Demo data

- **#superapp_builders** "SuperApp builders": owned by @superapp; the demo
  user is a **moderator**; Sarah, Marco and Ayşe are members. Six messages
  about the roadmap, including Marco's off-topic `seed-msg-sab-04`. The
  newest one is unread for the demo user.
- **#ankara_eats** "Ankara eats": owned by @foodie_ankara, with Lahmacun
  Lab, Kızılay Kahve and Ayşe. The demo user **hasn't joined**.

## Limits

3 channels per person (5 create attempts an hour), names up to 50
characters, descriptions up to 160, messages up to 1,000 (30 a minute,
shared with direct messages). Lists show at most 100 channels and 200
members.

## Tests

- Components: `components/channels/*.test.ts(x)` (the join bar, the
  Delete buttons, the create dialog, the members drawer, the cards and the
  slice).
- Routes and pages: `test/routes/channels.test.ts`. Repositories:
  `lib/db/channels.contract.test.ts` (both stores, including concurrent
  creates and removals).
- End to end: `e2e/channels.spec.ts` (Discover → join → post → leave, a
  moderator's removal of `seed-msg-sab-04`, creating, focus mode, Delete
  buttons, member counts and channel info kept on screen on phones, axe in
  both themes) and `e2e/channels.readonly.spec.ts`.

How SuperApp features are built is in [docs/SUPERAPP.md](../SUPERAPP.md).
