# Messages

Direct conversations between two people, with payments, payment requests
and shared Tweets inside them. Credits are the wallet's demo credits, which
have no cash value. The data and endpoints are described in the
[messages API](../api/messages.md).

## Where it lives

- **Inbox, `/messages`.** Messages in the sidebar and the phone tab bar; its
  badge counts conversations with unread messages. Each row shows the
  person, a preview ("You: Anytime! 🙌", "💸 Requested 4.50 credits", "Sent
  you 15.00 credits") and the time. Unread rows are bold with a dot.
  "New message" finds someone to write to. From 1024px the list (390px) sits
  beside the conversation, which reads "Select a message" until one is
  chosen; phones show one at a time. While Channels is on, the inbox has
  Chats | Channels tabs; the second leads to [Channels](channels.md).
- **Conversation, `/messages/<id>`.** Only its two members can open it;
  anyone else gets a 404. On phones it is in focus mode: no tab bar, the
  composer pinned at the bottom and a Back button to the inbox.
- **`/messages?to=<username>`.** The conversation with that person. If it
  exists, the server redirects to it (307). Otherwise it shows a draft that
  the first message, payment or request creates. Opening the page never
  writes anything. Yourself or an unknown username shows a not-found page
  (404).

`/messages?to=<username>` is the link every entry point uses: the Message
button on profiles, "Message @user" in a Tweet's "…" menu, and the New
message dialog. Orders, rides, receipts and story replies link to it as
those features ship.

## In a conversation

- **Messages:** text (mentions, hashtags and links work as in Tweets),
  shared Tweets as a card that links to the Tweet, story replies with the
  story's preview (or "Story no longer available"), payments ("You sent
  15.00 credits", with View receipt) and payment requests.
- **Requests** show their status (Pending, Paid, Declined, Cancelled,
  Expired), read from the request itself, so the next poll updates both
  people. The payer gets **Pay 4.50**, which opens a review with the amount,
  the note and the balance after, and **Decline**. The requester gets
  **Cancel** while the request is pending.
- **Composer:** Enter sends and Shift+Enter adds a line; on touch screens
  Enter adds a line and the Send button sends. Up to 1,000 characters.
- **Credits:** the "+" menu (Send credits, Request credits) and the coin
  button in the header open a sheet: the amount (quick picks 2, 5, 10, 20)
  and an optional note, then a review. Nothing moves until the server
  confirms; the payment or request card then appears in the chat.
- **Optimistic text:** only text shows before the server answers, as
  "Sending…", then "Not sent · Retry" if it fails. Retry sends it again with
  the same Idempotency-Key, so it is never posted twice.
- **Reading:** day separators ("Today", "Yesterday", "Oct 6"), "Seen" under
  your last message once the other person has read it, "Load older messages"
  at the top (your place is kept), and a "New messages" pill when something
  arrives while you are scrolled up.

## Updates

There is no background work: the page polls. An open conversation polls
every 4 s and the inbox every 15 s, both only while the tab is visible.
Failures back off to at most 60 s, and after two in a row a status line says
"Can't load new messages. Retrying…". A conversation is marked read while it
is open and visible, at most once every 5 s, which clears the badge.

A conversation's poll usually asks only for what came after the last
message it has. While a request in it is pending, and until its newest
message is 30 s old, it reads the newest page instead: a request's status
changes without a new message, and on Sanity a message whose write was slow
can land just behind one that was already shown.

## States

| State                       | What you see                                                                                                                                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty inbox                 | "Welcome to your inbox!" and New message                                                                                                                                                                       |
| Empty conversation or draft | "Say hi to Sarah Chen 👋"                                                                                                                                                                                      |
| The inbox can't be read     | An alert with Retry; the conversation beside it still shows                                                                                                                                                    |
| A send fails                | Text: "Not sent · Retry" under the bubble. Payments and requests: the review stays open with the reason                                                                                                        |
| READ_ONLY                   | Conversations can be read. The composer is replaced by "Messaging is turned off on this read-only demo.", requests have no buttons, the Tweet menu has no "Send via Direct Message" and nothing is marked read |
| Messages off                | `/messages` says so; conversation pages are 404s; the profile button and Tweet menu items are hidden                                                                                                           |
| Wallet off                  | No "+" menu, no Send credits, no receipt links and no request buttons; the API refuses chat payments and requests (404)                                                                                        |

## Accessibility

- The message list is a `role="log"`. New messages from the other person,
  and what happens to a request without you (paid, declined or cancelled by
  the other person, or expired), are announced politely, at most once every
  5 s ("2 new messages from Sarah Chen. Marco Rossi paid your 3.00 credits
  request"). Polling never moves focus.
- When the control you used goes away, focus moves next to it: to the
  request after paying, declining or cancelling; to the message list after
  Retry; to the search after removing the person in "Send Tweet".
- Amounts are always text. Each message's time is in the text for screen
  readers and shows on hover, on focus inside the message, and for every
  message while the list itself has keyboard focus.
- On phones, Pay, Decline, Cancel and the header's Send credits are at
  least 44px tall.
- Payments and requests have a review step whose focused button repeats the
  amount and the person (WCAG 3.3.4).
- The person search in New message is an ARIA 1.2 combobox: arrow keys
  move through people, Enter picks one, Escape closes the list (a second
  Escape closes the dialog), and the number of results is announced.
- The composer's hint ("Enter sends, Shift+Enter adds a new line") is linked
  with `aria-describedby`.

## Try it

1. Open Messages: the badge says 1. Sarah asked for 4.50 credits for
   "Coffee ☕". Choose **Pay 4.50** and confirm: the card turns Paid and your
   wallet shows −4.50.
2. In Marco's conversation, choose **+ → Send credits** and send 2.00: a
   payment card appears.
3. On a Tweet, open **… → Send via Direct Message**, pick someone and add a
   comment: the Tweet shows as a card in that conversation.
4. Open `/messages?to=nightowl_dev`: a draft. Say hi, and the conversation
   exists from then on.
5. As Sarah (`DEMO_USERNAME=sarahcodes`), open the conversation with the
   demo user and cancel her request.

## Demo data

The demo user starts with four conversations:

- **Sarah Chen**: Friday coffee, then her request for 4.50 credits for
  "Coffee ☕" (`seed-req01`), still pending and unread. This is the badge's 1.
- **Marco Rossi**: his 15.00 credits "Thanks for the code review 🙏"
  (`seed-tx03`) and a reply. Marco has read it.
- **Kızılay Kahve**: the café's automatic greeting, a question about oat
  milk and its answer.
- **Ayşe Yılmaz**: the demo user's request for "Design sprint pizza 🍕"
  (`seed-req02`), paid, and her thanks.

## Limits

Messages are up to 1,000 characters (30 a minute per person). Payments and
requests in chat follow the wallet's limits (0.50 to 200.00 credits, notes
up to 100 characters). The in-memory demo store keeps the newest 20,000
text messages; payments and requests are never dropped.

## Tests

- Components: `components/messages/*.test.ts(x)`, including the store
  slice (`messagesSlice.test.ts`).
- Pages and routes: `test/routes/messages.test.ts`. Repositories:
  `lib/db/messages.contract.test.ts`.
- End to end: `e2e/messages.spec.ts` (the demo user),
  `e2e/messages.sarah.spec.ts` (the requester's side of `seed-req01`) and
  `e2e/messages.readonly.spec.ts`.

How SuperApp features are built is in [docs/SUPERAPP.md](../SUPERAPP.md).
