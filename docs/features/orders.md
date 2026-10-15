# Orders

Anyone can order from a business with demo credits: straight from a
product card on a Tweet (**Order now**), or from its menu through the cart
and **checkout**. An order then moves through its stages by itself, and its
page tracks it. The payment reaches the business at once but is **held**
until delivery, so a cancel before then is refunded in full. The people who
run a business follow its orders on the **Business** board, where they can
cancel and refund, and simulate a customer with the **Demo bot**.

Everything here is the `orders` feature, which builds on the `shop`
(businesses, menus and product cards, see [shop.md](shop.md)). The API is
in [docs/api/orders.md](../api/orders.md); how SuperApp features are built
is in [docs/SUPERAPP.md](../SUPERAPP.md).

## Where it lives

| Place                                  | What it shows                                                                                                                                                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Order now** on a product card        | The quick order sheet: the product, a quantity, **Deliver to**, a note, the price, "From your available 308.60 credits" and **Pay 6.50 credits**, then the payment review and "Order placed · #K7Q2" with **Track order**.                                                        |
| A menu (`/<business>/menu`)            | **Add** on each product, quantity steppers, and the cart bar "View cart · 3 items · 14.50 credits", leading to checkout.                                                                                                                                                          |
| **Checkout** (`/checkout`)             | The business with its open state, the cart's lines with steppers, **Deliver to**, a note, subtotal, delivery fee and total, "SuperApp Wallet · 308.60 credits available · Demo" with the balance after the order, and **Place order · 14.00 credits**.                            |
| An order (`/orders/<id>`)              | "Order #K7Q2 from Kızılay Kahve", where it stands ("On the way · Arrives around 14:35"), a schematic line from the business to the delivery place with the courier's dot, the stages with their times, the receipt, and what can be done now.                                     |
| **Your orders** (`/orders`)            | **Active** (on their way) and **Past** (delivered or cancelled), each linking to its page; delivered ones offer **Order again**. Reached from the **Orders** tile in Services, Food's header, live activity, notifications and every order's page.                                |
| **Food** (`/food`)                     | **Order again** with your latest delivery from up to three places, and **Your orders** (the receipt icon in the header).                                                                                                                                                          |
| **Business** (`/business`), Orders tab | The board (the page's default tab): "Today: 4 orders · 63.00 credits · 15.00 pending", the business's wallet ("Available · Pending"), **Simulate a customer order · Demo bot**, then **In progress** (with **Cancel & refund**) and **Completed**, side by side from 1024px wide. |
| Live activity                          | An order on its way shows in the right column's "Happening now" card (from 1024px) or as a banner under the page header ("Order from Kızılay Kahve · On the way · arrives 14:35 · Track"), except on its own page.                                                                |
| Notifications                          | "New order #M2X9 from Marco Rossi at Twitter SuperApp" (to the people who run it, leading to the board), "Your order #K7Q2 from Kızılay Kahve was delivered", and "Kızılay Kahve cancelled your order #K7Q2. You got a full refund."                                              |
| The composer                           | **Attach a product** also suggests what you have had delivered, after the products of the businesses you run.                                                                                                                                                                     |

- While orders are off (`DISABLED_FEATURES=orders`, or on Sanity without a
  token) all of this is hidden: menus are a read-only list without Add or
  the cart bar, cards have no Order now, Business opens on Menu, and
  `/checkout` and `/orders*` answer 404.
- Orders, checkout and the order pages hide the phone's floating compose
  button; Place order and an order's actions sit in a bar at the bottom of
  the screen (above the tab bar on phones) that never covers what has
  focus.

## Ordering

**From a Tweet.** Order now opens the sheet for that product (it is
disabled, with the reason as text, while the business is closed or paused
or the product is sold out). **Pay** opens the review: who is paid, the
amount, the delivery fee, your note, what you have available and what is
left afterwards, with a focused button that repeats it all ("Pay 6.50
credits to Kızılay Kahve"). **Back** returns to the form with nothing lost.
The order credits the Tweet it came from (the business sees "from a
Tweet").

**From a menu.** Add products to the cart (one business at a time, see
[shop.md](shop.md#the-cart-for-ordering)) and open checkout from the cart
bar. Checkout reads the business's menu again: lines are priced at today's
prices (the cart only remembered them), sold-out or deleted ones are marked
with a **Remove** button, and the total is what the server will charge. The
page is the payment's review: Place order names the total and the business,
and changing a quantity reads the new total out politely.

**Deliver to** starts at the last place you ordered to on this device
(`localStorage["deliverTo:v1"]`, else Kızılay). Notes are up to 140
characters.

Placing an order is never optimistic: the button waits for the server, and
your balance changes only to what it answers. Each order carries an
`Idempotency-Key` kept for exactly that order, so retrying after a lost
answer (or pressing Back and Pay again with nothing changed) can never pay
twice; changing anything makes it a new order.

**What can stop an order**, said next to a disabled Pay or Place order
before anything is sent, or as an alert when the server says so:

- The business is closed ("Kızılay Kahve: Closed · Opens 11:00") or not
  taking orders.
- An item is sold out or gone ("Simit is sold out. Remove it to order.").
  When the server refuses an order for it, its answer names the items
  (the 422's `details`), and checkout or the sheet marks exactly those.
- The subtotal is under the business's minimum ("The minimum order at
  Kızılay Kahve is 3.00 credits. Add 0.50 credits more.").
- Over 200.00 credits, or 5 orders already on their way.
- Not enough credits ("You have 5.00 credits available." with **Add
  credits**).
- Prices changed since the page read them: "Prices changed. Review your
  order." Checkout and the sheet read the menu again and show the new
  total; nothing was charged. They do the same when the business closed
  or paused meanwhile.

## Tracking

An order's page derives everything from the order's stored schedule and the
server's clock (there are no background jobs):

- **Placed**, **Accepted** (a demo minute later, and never sooner than 15
  real seconds), **On the way** (after the business's preparation time) and
  **Delivered** (after its delivery time). The stages are an ordered list;
  the current one is marked `aria-current="step"`, and each shows its time
  (expected ones are read as "expected").
- The headline says where it stands ("On the way · Arrives around 14:35",
  "Delivered at 14:35", "You cancelled").
- The schematic line moves the courier's dot by time (it glides each
  second, and jumps under reduced motion). It is labelled "Schematic, not
  to scale", and its accessible name says the same thing in words.
- The receipt keeps the prices of the moment the order was placed. For the
  buyer it links to the payment ("Paid from wallet") and the refund.

While an order is on its way, the page asks the server every 5 seconds and
right after each stage is due, and stops while the tab is hidden. Between
answers it moves on with the server's clock. Each status change is read out
once, politely: while the order is in your live activity the shell already
says "Order from Kızılay Kahve: On the way", so the page says only what the
shell doesn't (delivery, a cancel by the business).

**Actions:**

- **Cancel order** (the buyer), until the business accepts the order.
- **Cancel & refund** (the people who run the business), until it is
  delivered.
- **Message Kızılay Kahve**, while Messages is on (`/messages?to=`).
- After delivery: **Order again** (the order's items fill the cart, after
  asking if it holds something else, and checkout opens) and **Tweet about
  it**, which opens the composer with "Just had the Pistachio latte from
  @kizilaykahve, ordered right from a Tweet ☕ #SuperApp" and the product's
  card.

## Cancelling and refunds

Cancelling asks first ("Cancel this order? Order #K7Q2 from Kızılay Kahve.
You get 6.50 credits back in full."). The refund reverses the held payment,
so it always works: the business can't have spent credits that were never
spendable, and refunds reach frozen wallets too. Cancelling twice is
harmless. Once the business has accepted, only the business can cancel; once
delivered, nobody can, and the credits become the business's to spend.

## The Business board

The Orders tab of `/business` is for the people who run the business (the
account and its managers; everyone else gets a 404):

- **Today** counts the orders placed since midnight in the business's time
  zone, their total and what is still pending (refundable until delivery),
  plus how many came from Tweets. The wallet line shows the business's own
  balance, available and pending.
- **In progress** shows each order's code, buyer, items, total, status and
  delivery place, with **Cancel & refund** behind a confirmation ("Marco
  Rossi gets 15.00 credits back for order #M2X9."). A cancelled order moves
  to **Completed**, and focus follows it there.
- **Simulate a customer order · Demo bot** places an order from the demo
  customer ("Demo Customer (bot)", marked **Demo bot**): one or two of the
  available products, to somewhere in the city, paid with credits issued
  for it in the same commit. Nobody's real balance is involved. It is
  limited to 5 an hour per person.

The board refreshes every 10 seconds while visible, and right after an
order is due to change.

## States

| Surface     | Empty                                                      | Loading                                        | Error                                                                                            | Read-only demo                                                                              |
| ----------- | ---------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Quick order | "This item is no longer available."                        | A spinner                                      | The error and Retry; the server's refusals inline in the review                                  | Pay disabled: "Ordering is turned off on this read-only demo."                              |
| Checkout    | "Your cart is empty" and Browse Food                       | A spinner (the cart is read on this device)    | Prices changed, unavailable items, not enough credits and limits inline; a business that is gone | Place order disabled with the reason                                                        |
| An order    | —                                                          | Rendered on the server, then polled            | After two failed polls: "Can’t reach the server to update this order. Retrying…"                 | No Cancel and no Tweet about it                                                             |
| Your orders | "No orders yet" and Browse Food                            | Rendered on the server                         | Show more: the error and Retry                                                                   | Unchanged                                                                                   |
| Business    | 404 for anyone who runs no business; "No orders yet today" | Rendered on the server, then polled every 10 s | "Can’t refresh the orders right now. Retrying…" and Retry now                                    | Cancel & refund and the Demo bot disabled: "Changes are turned off on this read-only demo." |

## Limits

- An order has 1 to 10 different products, 1 to 20 of each, and is at most
  200.00 credits. The minimum is the business's, on the subtotal.
- 5 orders on their way per buyer at a time (exact, even for simultaneous
  orders). Demo bot orders don't count towards anyone's.
- Placing an order shares the wallet's 12 money operations a minute; the
  Demo bot allows 5 an hour per person.
- The buyer can cancel for at least 15 real seconds, however fast
  `SUPERAPP_TIME_SCALE` runs the demo.

## Accessibility

- Amounts are text ("6.50 credits"); stages, open states and "Sold out"
  are text, never colour alone.
- Every payment has a review (WCAG 3.3.4): the sheet's PaymentConfirm, with
  a focused confirm that repeats amount and payee; checkout is itself the
  review, and Place order names the total and the business.
- Disabled Pay, Place order, Cancel & refund and Demo bot stay focusable
  (`aria-disabled`) and are described by the reason.
- Status changes are announced once, politely: by the order's page while
  it is open, by the shell's live activity announcer anywhere else.
  Countdowns never are.
  Polling never moves focus. After a cancel, focus goes to the headline
  (the order page) or to the order's new place (the board).
- The sheet and the confirmations are native `<dialog>`s. Quantity
  steppers are named for the item ("Add one Pistachio latte"); the quick
  order's "Remove one" stays focusable at 1.
- Bottom bars reserve their height in the page's scroll padding, so a
  focused control is never left underneath them.

## Try it

With the default memory store (`SUPERAPP_TIME_SCALE=60` makes a Kızılay
Kahve order arrive in about 24 seconds):

1. On the Tweet "New on the menu: pistachio latte ☕" (`seed-t22`), press
   **Order now**, then **Pay 6.50 credits** and confirm. **Track order**
   follows it to Delivered; then **Tweet about it**.
2. Open `@kizilaykahve`'s Menu, add a few things and **View cart**; change
   a quantity at checkout and **Place order**.
3. Place another order and **Cancel order** within the first 15 seconds:
   your balance is back where it was.
4. The demo user runs **@superapp**: **Business** opens on its orders,
   where Marco Rossi's mug (`seed-o03`) is on its way for about two hours
   after the server starts. Press **Simulate a customer order · Demo bot**,
   then **Cancel & refund** one.
5. **Your orders** (from Food, or the notification about `seed-o01`)
   lists them all; **Order again** refills the cart.

With `DEMO_USERNAME=sarahcodes` you see Sarah's order (`seed-o02`) and get
404 for everyone else's. With `READ_ONLY=true`, everything shows and
nothing can be ordered, cancelled or simulated.
