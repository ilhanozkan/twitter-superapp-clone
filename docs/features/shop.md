# Businesses and menus

A **business** is an account with `accountType: "business"` and a business
profile. Its name and avatar always come from the account. Businesses sell
**products**: they are listed on the business's menu, and a Tweet can carry
one as a product card. Everything here is the `shop` feature; ordering
(Order now, the cart's checkout, order tracking) is the `orders` feature,
which builds on it.

The API is in [docs/api/shop.md](../api/shop.md). How SuperApp features are
built is in [docs/SUPERAPP.md](../SUPERAPP.md).

## Where it lives

| Place                                 | What it shows                                                                                                                                                                                                                                                                            |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A business profile (`/kizilaykahve`)  | "Business · Café" as text with a storefront icon (never a badge that could pass for verification), whether it is open ("Open now · Closes 02:00", "Closed · Opens 11:00", "Not taking orders right now"), "Delivery 9–12 min · 1.50 credits fee · Min. 3.00", the address and **Order**. |
| The **Menu** tab (`/<business>/menu`) | Sections ("Coffee", "Bakery") as headings, each product with its picture, description, price and "Sold out" when it is. A product's details open in a dialog with its own URL, `?product=<id>`.                                                                                          |
| Product cards on Tweets               | Picture, name, price and "Kızılay Kahve · Open · 9–12 min", with **View menu** and **Order now** (the orders feature's quick order). The product's name opens its details on the menu.                                                                                                   |
| The composer                          | **Attach a product** (the bag icon) suggests products of businesses you manage, then what you have had delivered. The attached product previews above the toolbar with a Remove button.                                                                                                  |
| **Food** (`/food`)                    | Every business with its banner, category, open state, delivery estimate and fee, and its top three items. The category chips (All, Café, Restaurant, Healthy, Shop) filter on the page.                                                                                                  |
| **Services**                          | "Order from": a row of businesses that scrolls sideways, and "See all" to Food.                                                                                                                                                                                                          |
| **Business** (`/business`)            | For the people who run a business only (everyone else gets a 404): the **Accepting orders** switch; **Orders**, the board (the orders feature, see [orders.md](orders.md)); **Menu**, a switch per product ("Sold out" when off); **Settings**, the profile as customers see it.         |

- The Menu tab, Order, the business details on profiles, Food, the Services
  row and the Business page exist only while the shop is on. With it off,
  they are hidden and the pages answer 404, and Tweets carry no cards.
- Business (in the sidebar, and in the avatar menu on phones) shows only to
  people who run a business. With several, the page switches between them
  (`?business=<username>`). Orders is the default tab while orders are
  on (Menu otherwise); Menu is `?tab=menu` and Settings `?tab=settings`.
- Profiles and menus are edited in Sanity Studio (Food → Businesses, Food →
  Products), so the Settings tab is read-only and says so. The app changes
  two things only: Accepting orders and a product's availability.

## Products on Tweets

- Any Tweet can carry any **available** product, like sharing a link. The
  composer only _suggests_ your own and, while orders are on, what you
  have had delivered (your last 50 deliveries, latest first). A sold-out product can't be attached (the post answers 422).
- A product deleted since reads "This item is no longer available".
- A closed or paused business shows why on the card ("Closed · Opens
  11:00", "Not taking orders right now"), and Order now is disabled with
  that reason. Sold out shows a "Sold out" badge.
- The card's controls are real links and buttons, so a click on them never
  opens the Tweet; nor does a click on a disabled Order now or around it.

## The cart (for ordering)

The menu's **Add** buttons, the quantity steppers and the cart bar
("View cart · 3 items · 14.50 credits", leading to checkout) belong to
ordering: they show only while the orders feature is on, because the cart
has nowhere to go until then.

- A cart holds one business. Adding from another asks first: "Start a new
  cart? Your cart from Lahmacun Lab will be cleared."
- Up to 10 different products, up to 20 of each.
- The steppers are named for the item ("Remove one Pistachio latte", "Add
  one Pistachio latte"); the cart's total is read out politely as it
  changes, in a product's details too (a modal dialog silences the rest of
  the page, so the dialog has its own). Focus moves to the control that
  replaces the one you pressed, and the page scrolls it clear of the cart
  bar. Only the pill takes taps: the margin around it, where the menu shows
  through, passes them to the menu.
- It is kept on this device in `localStorage["cart:v1"]` (other tabs follow
  along). Pages render with an empty cart on the server and restore it once
  they run. When storage is blocked or full, the cart still works on the
  page.
- The cart remembers each product's price when it was added; checkout prices
  the order again from the menu (see [orders.md](orders.md)).

## States

| Surface        | Empty                                                                                                   | Loading                          | Error                                                       | Read-only demo                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Food           | "No places are taking orders right now."; a category with none: "No places in this category right now." | Rendered on the server           | —                                                           | Unchanged                                                                   |
| Menu           | "This business hasn’t added a menu yet."                                                                | Rendered on the server           | —                                                           | Add disabled, with "Ordering is turned off on this read-only demo."         |
| Product card   | "This item is no longer available"                                                                      | Arrives with the Tweet           | —                                                           | Order now disabled with the reason                                          |
| Product picker | "Products from businesses you manage or have ordered from appear here." and Browse Food                 | A spinner                        | The error and Retry                                         | The composer is hidden                                                      |
| Services row   | Hidden                                                                                                  | A placeholder of the same height | Hidden (Food is still a tile)                               | Unchanged                                                                   |
| Business       | 404 for anyone who runs no business; "This business hasn’t added a menu yet."                           | Rendered on the server           | A switch that fails to save moves back and a toast says why | The switches are disabled: "Changes are turned off on this read-only demo." |

## Limits

- A product's name is up to 60 characters, its description 140, its alt
  text 120, and its price 0.10 to 200.00 credits. A product shows only once
  it has a name, a section and a price, because Studio publishes a product
  as it is typed, and only while its business is a business's username
  (in any case, without spaces).
- The cart: one business, 10 products, 20 of each.

## Accessibility

- Open states, delivery and "Sold out" are text, never colour alone; icons
  next to them are decorative.
- The switches are `role="switch"` with `aria-checked`, named by the
  product or "Accepting orders". The track has at least 3:1 contrast with
  the page, and the thumb at least 3:1 with the track, in both themes; the
  row says "Available" or "Sold out".
  While a change is saved the switch keeps focus and ignores presses.
- The category chips are toggle buttons (`aria-pressed`); a polite status
  says how many places a filter left.
- The Services row is a native list of links that scrolls sideways; Tab
  scrolls it until the business it lands on is fully in view.
- The product dialog, the picker and the new-cart prompt are native
  `<dialog>`s: focus stays inside, Escape closes them and focus returns to
  what opened them. The picker and the prompt close alone: the Compose
  dialog keeps its draft, and a product's details stay open.

## Try it

With the default memory store:

1. Open `@kizilaykahve`: its details, **Order** and the **Menu** tab. Open
   the Pistachio latte for its details.
2. The Tweet "New on the menu: pistachio latte ☕" (`seed-t22`) carries its
   card; so do the Tweets of @lahmacunlab, @bowlandco and @superapp.
3. **Food** (from Services) lists the four businesses; try the chips.
4. The demo user manages **@superapp**: open **Business** → **Menu**, mark the
   SuperApp mug sold out, and its menu shows it. (The Hoodie is sold out
   already.) Turn **Accepting orders** off, and the profile reads "Not
   taking orders right now". Turn both back on.
5. In the composer, **Attach a product** offers the Sticker pack and the
   mug; Tweet with one and the Tweet shows its card.

With `DEMO_USERNAME=sarahcodes`, Business is gone and the picker explains
where products come from. With `READ_ONLY=true`, menus and cards show and
the switches are disabled.
