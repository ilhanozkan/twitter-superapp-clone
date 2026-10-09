# Wallet

Every account has a wallet of **demo credits**: they have no cash value and
can't be bought, withdrawn or exchanged. You add them for free, then tip
Tweets, pay people, ask them to pay you, and pay for orders and rides. Every balance in
the app carries a "Demo" pill or says "Demo credits".

The [wallet API](../api/wallet.md) and the ledger behind it
([docs/SUPERAPP.md](../SUPERAPP.md#ledger-and-holds)) come from the
foundation; this page describes the wallet's screens and controls.

## Where it lives

| Place                             | What it shows                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `/wallet`                         | Balance, Send / Request / Add credits, Requests for you, Activity \| Requests |
| `/wallet?tab=requests`            | The same page on the Requests tab (where request notifications lead)          |
| `/wallet/transactions/<id>`       | A receipt; only its two parties can open it, anyone else gets a 404           |
| Services, right column (≥ 1024px) | A wallet card with the balance and the actions (Send and Add on the right)    |
| Navigation                        | Wallet in the sidebar; on phones it is in the avatar menu                     |
| Every Tweet                       | **Tip** in the action row; "Send credits to @user" in the "…" menu            |
| Profiles                          | A **Send credits** icon button next to the other profile actions              |

The Send, Request, Add credits and Tip dialogs are global (`ui.dialog`
`"send"`, `"request"`, `"topUp"`, `"tip"`), so any page can open them. They
are bottom sheets on phones and centred dialogs above 500px.

## The wallet page

- **Balance:** the balance in large tabular figures, "credits" and the Demo
  pill. When some credits are held ("Available 293.60 · Pending 15.00") a help
  button explains that they come from orders or rides that can still be
  refunded.
- **Actions:** Send (primary), Request, Add credits. On phones they are a
  three-column grid with the icon above the label, at least 44px tall.
- **Requests for you:** pending requests others sent you, e.g. "Sarah Chen
  requested 4.50 credits · Coffee ☕ · 5h", with **Pay 4.50** and **Decline**.
  Pay opens the payment review; once answered, the card stays with its new
  status (Paid with a link to the receipt, or Declined) and keeps focus.
  Hidden when nobody is waiting on you.
- **Activity | Requests:** two tabs with their own URLs.
  - Activity lists transfers by day (Today, Yesterday, Oct 6). Each row is a
    link to its receipt with the other party's avatar (or the SuperApp mark
    for added credits), a description ("Tip on @lenaframes's Tweet", "Order
    #K7Q2 · Kızılay Kahve", "Added demo credits", "Refund · Order #K7Q2"), the
    time and the signed amount: `+12.50` in green with "received" for screen
    readers, `−4.50` with "sent". Held credits show **Pending** and refunded
    ones **Refunded**. More loads as you scroll, with a Show more button.
    What you send, add or pay on this page appears on top right away.
  - Requests lists the requests you sent, newest first, with their status
    (Pending, Paid, Declined, Cancelled, Expired) and **Cancel** while one is
    pending.

## Sending credits

1. **To:** search people by name or @username, or pick one of the people you
   recently exchanged credits with. The search field is an ARIA 1.2 combobox:
   arrow keys move through the suggestions, Enter picks one, Escape closes the
   list (a second Escape clears the field, a third closes the dialog), and
   the number of suggestions is announced. This step is skipped and locked
   when the dialog is opened for someone (see [Send credits from a profile
   or a Tweet](#send-credits-from-a-profile-or-a-tweet), a chat, a receipt's
   Send again).
2. **Amount & note:** the amount in credits (a decimal keypad on phones, at
   most 2 decimals, 0.50 to 200.00), quick amounts 2, 5, 10 and 20, and an
   optional note of up to 100 characters.
3. **Review:** "Send 10.00 credits to Sarah Chen (@sarahcodes)", the note,
   what you have available and the balance after. The focused confirm button
   repeats the amount and the person (WCAG 3.3.4). If your available credits
   don't cover it, the review says how much you have and offers Add credits.
4. **Done:** "Sent", with View receipt and Done, and a toast with a Receipt
   link.

Back moves between the steps and keeps what you typed.

**Errors** show in the review, above the confirm button that they describe:
not enough credits (with Add credits), a frozen wallet ("A moderator froze
your wallet…", or the other person's), too many payments in a minute, and
connection problems.

**Never paid twice.** Each send carries an Idempotency-Key. The dialog keeps
it while the person, amount and note stay the same, through Retry, the
automatic retry after a lost connection, and going Back and returning to the
review; the server then replays the first outcome instead of paying again.
Changing the person, amount or note, or a success, makes a new key; closing
the dialog drops it. Balances are never guessed: the wallet shown afterwards
is the one the server returned.

### Send credits from a profile or a Tweet

- **Profiles** have a Send credits icon button ("Send credits to
  @sarahcodes") next to the other actions.
- **Tweets** by someone else have "Send credits to @user" in their "…" menu.

Both open Send for that person, straight on the amount step. Neither shows
on your own profile or Tweets, on a read-only demo, or while the wallet is
off.

## Requesting credits

The same steps: "Request 10.00 credits from Sarah Chen" on the review (no
balance check, since nothing leaves your wallet), then "Request sent. You'll
get a notification when Sarah Chen pays." The request shows on the Requests
tab, and the person you asked gets a notification. Requests expire after 7
days, and you can have 10 pending at a time.

## Paying and declining a request

**Pay 4.50** opens the payment review for that request ("Pay 4.50 credits to
Sarah Chen") with the same checks, errors and retries as Send. **Decline**
answers right away. Either can be repeated safely.

## Tipping a Tweet

The action row under every Tweet has six actions: Reply, Retweet, Like,
**Tip**, Bookmark and Share.

- **Someone else's Tweet:** a coin with the number of tips. Tips are counted
  in public, but amounts never are. The button says "Tip. 3 tips" to screen
  readers and opens the tip sheet.
- **Once you have tipped it:** the coin is filled and amber, and the button
  says "Tip again. You tipped this Tweet. 3 tips". You can tip again.
- **Your own Tweet:** the coin and the count as plain text in the same
  place (read as "3 tips"), so the row stays aligned. There is nothing to
  press.
- **Read-only demo:** disabled, like Like and Retweet.
- **A Tweet's page** shows "**3** Tips" next to Retweets and Likes instead of
  a count on the button.

The six actions fit a 360px phone.

**The tip sheet** ("Tip @lenaframes"):

1. **Amount & thanks:** the Tweet's author and the first two lines of its
   text, then 1.00, 2.00, 5.00 or 10.00 credits (2.00 is chosen when it
   opens), or **Other** for any amount from 0.50 to 50.00. An optional "Say
   thanks" note of up to 100 characters, and what you have: "From your
   available 308.60 credits". The button repeats the amount: **Tip 2.00
   credits**.
2. **Review:** "Tip 2.00 credits to Lena Hoffmann (@lenaframes)", the note,
   what you have and the balance after, with the confirm button focused
   (WCAG 3.3.4). Back returns to the amount with your choice kept.

On success the sheet closes and focus goes back to the Tip button, which is
now filled and counts your tip: the Tweet is replaced with the one the
server returned. A toast says "You tipped @lenaframes 2.00 credits", with a
Receipt link. The author gets a notification with the amount.

Errors, retries and the Idempotency-Key work as for Send: not enough
credits (with Add credits), a frozen wallet, too many payments in a minute,
or a Tweet that was deleted meanwhile ("Tweet not found").

## Adding credits

Choose 25.00, 50.00 or 100.00 ("Demo credits are free and have no cash
value."), then **Add 50.00 demo credits**. An amount you can't add now is
disabled with the reason under it:

- **Over the 1,000.00 cap:** a top-up can't take your balance past 1,000.00.
- **Daily limit reached:** at most 3 top-ups in any 24 hours.

The dialog also shows your balance and how many top-ups are left.

## Receipts

A receipt shows the signed amount and its status: **Completed**, **Pending
until 14:35 · refundable until then** for a held credit, or **Refunded** with
a link to the refund. Below: From and To (linked profiles), the date, the
note, what it was for (the Tweet, or "Tweet deleted"; the order, ride or
conversation while that feature is on) and a reference such as
`TX-4K2P…` with a Copy button. Payments you made have **Send again**, which
opens Send for the same person with the amount and note filled in;
**Message** appears while Messages is on.

## States

| Surface          | Empty                                                                                   | Loading                                             | Error                                     | Read-only demo                                                    |
| ---------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| Activity         | "No activity yet. Add demo credits, then tip a Tweet or pay a friend." with Add credits | Server-rendered, then a spinner while more loads    | Retry under the list                      | Banner, no actions                                                |
| Requests for you | Hidden                                                                                  | Server-rendered                                     | Inline alert with Retry                   | Pay and Decline disabled, with the reason                         |
| Requests tab     | "No requests" with Request credits                                                      | Server-rendered                                     | Inline alert with Retry                   | Cancel disabled, with the reason                                  |
| Dialogs          | —                                                                                       | The button shows a spinner and waits for the server | Inline alert linked to the confirm button | Not available ("Payments are turned off on this read-only demo.") |
| Tip action       | No count shown for 0 tips ("Tip. 0 tips" to screen readers)                             | Server-rendered with the Tweet                      | In the tip sheet's review                 | Disabled; "Send credits" is hidden from profiles and Tweet menus  |

A wallet a moderator froze shows a danger banner on `/wallet`: "A
moderator froze this wallet. You can't send or receive credits right now.
Refunds still reach you." Its money actions answer with that reason.

## Try it with the demo data

- Your wallet starts with seeded activity: a tip you sent to @lenaframes, a
  tip from Sarah, 15.00 from Marco ("Thanks for the code review 🙏") and
  Ayşe paying your pizza request.
- **Requests for you:** Sarah asks for 4.50 (Coffee ☕), Marco for 3.00
  (Parking 🅿️) and Priya for 6.00 (Team lunch 🍜). Pay one, decline another.
- **Send** 10.00 to Sarah, then open the receipt from the dialog or the toast.
- **Tip** Sarah's "Hot take" Tweet on her profile: the count goes up and
  the coin fills. Your own Tweets show their tips without a button.
- Open a profile or a Tweet's "…" menu and **Send credits** from there.
- **Request** a few credits from someone and cancel it on the Requests tab.
- **Add credits** three times to see the daily limit, or until the cap.
- Run with `READ_ONLY=true` to see the read-only states, or
  `DEMO_USERNAME=sarahcodes` to see a request (and a tipped Tweet) from the
  other side.
