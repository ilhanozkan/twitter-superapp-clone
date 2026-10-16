# Rides

Book a trip across Ankara with a demo driver, watch the car on a schematic
map, cancel for a full refund until pickup, and tip the driver afterwards.
Fares are fixed upfront and paid in **demo credits**, which have no cash
value. Drivers, cars and times are simulated: nothing moves in the real
world, and demo trips are shorter than real ones. The page says so.

How SuperApp features are built is in [docs/SUPERAPP.md](../SUPERAPP.md); the
API is in [docs/api/rides.md](../api/rides.md).

## Where it lives

| Place                                     | What you get                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Services → **Rides**                      | `/rides`, the booking page                                                                  |
| A business profile (e.g. `/kizilaykahve`) | **Ride here** next to the address: `/rides?to=<place>` with the destination preselected     |
| A ride's notification                     | "Your ride to Atakule is complete" opens `/rides/<id>`                                      |
| Live activity (right column or banner)    | "Ride to Atakule · Ahmet is on the way · arrives 14:29 · Track" while a ride is in progress |
| A wallet receipt for a fare or a tip      | "For: Ride #R7K2" links back to the ride                                                    |

Both pages use the wide layout (the map beside the panel from 1024px) and
hide the compose button. With Rides off (`DISABLED_FEATURES=rides`) the
pages answer 404, the Services tile and **Ride here** are hidden, and ride
notifications are not listed.

## Booking (`/rides`)

- **The map** (`SchematicMap`) is an inline SVG with no network requests.
  Places are projected from their coordinates onto a flat plane and the
  view fits the route with padding. It shows the route as a curve, the
  pickup (ring) and destination (square), and nearby places as dots. It is
  one image named like "Map from Kızılay to Atakule, 5.1 km", captioned
  "Schematic map, not to scale". On phones it sits above the panel at 4:3.
- **Where to?** Pickup and Destination are native selects of the fixed
  places, with **Swap pickup and destination** between them. Chips repeat
  your recent destinations. `?to=` preselects the destination (Ride here),
  and `?from=&to=` both (Book again); the pickup moves out of the way when
  they would be the same place.
- **Choose a ride** is a native radio group: arrow keys move between the
  types and skip disabled ones. Each option reads as one sentence, e.g.
  "Economy · 7.40 credits · 3 min away · 4 seats". A type whose drivers are
  all busy, inactive or frozen says **No drivers nearby** and is disabled.
- **Prices appear at once.** Fares and pickup times are pure functions of
  the two places (`lib/superapp/rides.ts`, shared with the server), so a new
  route is priced on the client immediately. Whether a driver of each type
  is free comes from `GET /api/rides/quote`, asked for each new route and
  every 30 seconds.
- **The payment row** is the review step: "SuperApp Wallet · Demo", the
  credits available and what is left after this ride. The sticky
  **Book Economy · 7.40 credits** button repeats the type and the fare. You
  pay upfront; the fare is held for your driver until pickup.
- **Booking** sends the fare you saw as `expectedFare` with an
  `Idempotency-Key`. The key stays the same while you retry the same
  choice (so a lost answer can never book twice) and changes with the
  route, type or fare. Money is never optimistic: the button shows a
  spinner until the server answers, then the ride's page opens and your
  balance updates from the response.
- **Below:** "Recent rides", newest first with **Show more**, then the
  simulation notice.

### States

| State                            | What you see                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| No rides yet                     | The form, and "No rides yet. Your trips will show up here."                                                         |
| A type with no free driver       | "No drivers nearby" on the option; Book says "No Comfort drivers are nearby right now. Choose another ride."        |
| Not enough credits               | Book is disabled with "You have 3.00 credits available. Add credits to book this ride." and an **Add credits** link |
| The fare changed (409)           | "The fare changed. Check the new price and book again." The quotes refresh.                                         |
| The driver was just taken (422)  | The server's message; the quotes refresh and the type shows No drivers nearby.                                      |
| A ride already in progress (409) | "You already have a ride in progress…" with **Track your ride**                                                     |
| Frozen wallet                    | The frozen-wallet banner; Book is disabled with the reason                                                          |
| `READ_ONLY=true`                 | "Booking is turned off on this read-only demo." as a banner and as Book's reason                                    |

Disabled buttons use `aria-disabled` with the reason as visible text linked
by `aria-describedby`, so they stay focusable and the reason is read out.

## A ride (`/rides/<id>`)

Only the rider and the driver can open a ride; anyone else gets the 404
page.

- **Headline by stage:** "Finding your driver…", "Ahmet is 3 min away",
  "On the way to Atakule · arrives 14:32", "You’ve arrived", or "Ride
  cancelled · refunded". Under it, the stages as an ordered list (Finding
  your driver, Ahmet is on the way, Picked up, Arrived at Atakule) with
  their times and `aria-current="step"`.
- **The car** moves along its current leg (from where the driver sets off
  to the pickup, then along the route). The page re-derives the ride every
  second on the server's clock (`rideAt`, the same rules the server uses),
  so stages change on time without waiting for a poll. Under
  `prefers-reduced-motion: reduce` the car jumps to each position with no
  transition.
- **Announcements:** each new stage is said once, politely. While the ride
  is in progress it is live activity, and the shell's live activity
  announcer reads its stages out on every page, this one included ("Ride
  to Atakule: Ahmet is on the way", "Ride to Atakule: On the way to
  Atakule"), so the page's own region leaves those to it. The page says
  the rest itself: "You’ve arrived at Atakule", a cancel made elsewhere
  ("Ride cancelled. Your fare was refunded"), and every stage for the
  driver ("Head to Kızılay"). A cancel made here is said by the headline
  taking focus and the toast. The countdown is never announced, and
  polling never moves focus.
- **Polling:** every 5 seconds while the ride is in progress (to see a
  cancel from another tab), and right after each `nextChangeAt`. After two
  failed polls a quiet status says the page is trying again.
- **The driver card** (once a driver is matched): avatar, name, "White
  Toyota Corolla" and the plate "06 AK 1234", and **Message Ahmet**
  (`/messages?to=ahmet_drives`) while Messages is on. There are no star
  ratings anywhere.
- **Trip:** pickup → destination, ride type and seats, distance, the fare
  paid, the ride code, and the payment's receipt in the wallet.
- **Cancel ride** shows until pickup (at least 30 seconds after booking,
  whatever the demo speed). It asks first ("Cancel this ride? You’ll get
  your 6.30 credits back right away."), refunds the whole fare, frees the
  driver, and moves focus to the headline. Cancelling takes no key: it is
  idempotent on the server. A confirm that arrives after pickup explains
  that it is too late.
- **After the ride:** the trip becomes the **Receipt** (with pickup and
  arrival times), **Tip Ahmet** offers 1.00, 2.00 and 5.00 credits, and
  **Book again** opens `/rides` with the same route. Each tip opens the
  shared payment review (`PaymentConfirm`: payee, amount, available and
  balance after, a focused confirm "Tip 2.00 credits to Ahmet Kaya"), whose
  key covers every retry of that review. A toast confirms it with a link to
  the receipt.
- **A cancelled ride** shows the refund and links to the refund's receipt.

### The driver's view

An account with a driver profile (try `DEMO_USERNAME=ahmet_drives`) sees
**Your trips** on `/rides` instead of the booking form: the rides booked
with them, read-only. On a ride's page the headline speaks to the driver
("Pick up Ilhan at Kızılay in 2 min", "Driving Ilhan to Atakule"), the trip
names the rider, and there is no cancel, tip or Book again.

## Limits

| What               | Limit                                                                              |
| ------------------ | ---------------------------------------------------------------------------------- |
| Rides in progress  | One per rider; the next one can be booked once it ends or is cancelled             |
| Free cancel window | Until pickup, never less than 30 seconds of real time                              |
| Tips               | 1.00, 2.00 or 5.00 from the page (the API takes 0.50–50.00), after completion only |
| Fares              | At most 200.00 credits (no route in the catalog comes close)                       |
| Money operations   | Booking and tips share the 12-per-minute money budget; cancelling doesn't spend it |

## Demo data

| Driver         | Type        | Car                  | Plate      |
| -------------- | ----------- | -------------------- | ---------- |
| `ahmet_drives` | Economy     | White Toyota Corolla | 06 AK 1234 |
| `elif_rides`   | Economy     | Grey Renault Clio    | 06 EL 4521 |
| `canwheels`    | Comfort     | Black Skoda Superb   | 06 CN 7788 |
| `zeynep_xl`    | XL, 6 seats | Blue Ford Tourneo    | 06 ZY 3030 |

The demo user rode Bahçelievler → Atakule with Ahmet two days ago
(`seed-ride01`, economy, 7.40 credits): it is in Recent rides, in the
notifications ("Your ride to Atakule is complete") and in the wallet. Ahmet
also Tweeted about joining (`seed-t26`).

### Try it

1. `npm run dev` and open **Services → Rides**, or **Ride here** on
   `/kizilaykahve`.
2. Book Kızılay → Atakule. At normal speed a driver is matched in 10
   seconds and arrives in 2–5 minutes; the trip takes 8 minutes. To watch a
   whole trip quickly, start with `SUPERAPP_TIME_SCALE=60`: matching takes
   3 seconds, pickup comes 30 seconds after booking and the trip 8 seconds
   after that.
3. Cancel within the first 30 seconds for a full refund, or let it finish
   and tip your driver.

## Accessibility

- The map is `role="img"` with a label, and everything it shows is also
  text on the page (the places, the distance, the stage).
- Ride options are a native radio group; chips are buttons with
  `aria-pressed`; the swap button has a name.
- Book, the ride options, Cancel ride, the tip chips, Message and Book
  again are at least 44px tall.
- Dialogs (cancel, tip) are native `<dialog>`s: focus is trapped, Esc
  closes them and focus returns to the control that opened them, or to
  the headline when that button is gone (after a cancel, or once pickup
  has passed with the dialog open).
- Tabbing through the booking form, each control scrolls clear of the
  sticky Book bar (and, on phones, the tab bar under it): while the bar is
  on the page it keeps its height, which grows with a reason or an error,
  in `--book-bar` on `<html>` and adds it to the root's
  `scroll-padding-bottom`, which is what browsers check before scrolling
  focus into view.
- The car ("White Toyota Corolla") and the rows of Recent rides wrap
  instead of being cut off; only names truncate.
- The pages pass axe (WCAG 2.2 AA) in light and dark themes, in progress
  and completed, and fit from 360px to 1440px without horizontal scrolling.

## Code

| Path                                | What                                                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pages/rides/index.tsx`, `[id].tsx` | The booking page (or a driver's trips) and a ride's page                                                                                                                              |
| `components/rides/`                 | `SchematicMap`, `BookingPanel`, `RideOptions`, `RideStatus`, `DriverCard`, `RideReceipt`, `RideTip`, `CancelRide`, `RideList`, `RideView`, `RideHereLink`, the notification renderers |
| `slices/ridesSlice.ts`              | Rides on the current page and the booking, cancel and tip thunks                                                                                                                      |
| `lib/superapp/rides.ts`             | Fares, schedule, stages and `rideAt`, shared by both stores and the client                                                                                                            |
| `lib/client/ridesApi.ts`            | The client calls                                                                                                                                                                      |

Tests: unit (`lib/db/rides/rules.test.ts`), contract
(`lib/db/rides.contract.test.ts`, both stores), routes and pages
(`test/routes/rides.test.ts`), components (`components/rides/*.test.tsx`)
and end to end (`e2e/rides.spec.ts`, `rides.sarah.spec.ts`,
`rides.readonly.spec.ts`).
