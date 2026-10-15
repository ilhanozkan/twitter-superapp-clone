import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useId, useRef, useState } from "react";

import { ApiRequestError, errorMessage } from "../../lib/client/api";
import { shopApi } from "../../lib/client/shopApi";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { LIMITS } from "../../lib/superapp/limits";
import { formatCredits } from "../../lib/superapp/money";
import { PriceLine, priceOrder } from "../../lib/superapp/orders";
import {
  CART_MAX_QUANTITY,
  CartBusiness,
  CartLine,
  cartCleared,
  itemAdded,
  itemRemoved,
  lineRemoved,
} from "../../slices/cartSlice";
import { OrderEntry, placeOrder } from "../../slices/ordersSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IBusiness } from "../../types/Business";
import { IProduct } from "../../types/Shop";
import Avatar from "../common/Avatar";
import { Button, ButtonLink } from "../common/Button";
import EmptyState from "../common/EmptyState";
import Spinner from "../common/Spinner";
import BusinessStatus from "../shop/BusinessStatus";
import { deliveryText } from "../shop/format";
import { FOOD_PATH, menuPath } from "../shop/paths";
import QuantityStepper from "../shop/QuantityStepper";
import { useBottomScrollPadding } from "../layout/useBottomScrollPadding";
import { useCart, useCartSync } from "../shop/useCart";
import DemoBadge from "../superapp/DemoBadge";
import Money from "../superapp/Money";
import PlaceSelect from "../superapp/PlaceSelect";
import { orderBlocker, unavailableProducts } from "./blockers";
import { useDeliverTo, writeDeliverTo } from "./deliverTo";
import { orderNumber, orderPath } from "./format";
import PriceSummary from "./PriceSummary";

type Menu =
  | { state: "loading" }
  | { state: "loaded"; business: IBusiness; products: Map<string, IProduct> }
  | { state: "gone" }
  | { state: "failed"; message: string };

async function loadMenu(username: string): Promise<Menu> {
  try {
    const { business, menu } = await shopApi.getBusiness(username);
    const products = new Map(
      menu
        .flatMap((section) => section.products)
        .map((product) => [product.id, product])
    );
    return { state: "loaded", business, products };
  } catch (reason) {
    return reason instanceof ApiRequestError && reason.status === 404
      ? { state: "gone" }
      : { state: "failed", message: errorMessage(reason) };
  }
}

/** The menu with these products sold out, as the server just said. */
function markSoldOut(menu: Menu, productIds: string[]): Menu {
  if (menu.state !== "loaded") return menu;
  const products = new Map(menu.products);
  for (const id of productIds) {
    const product = products.get(id);
    if (product) products.set(id, { ...product, available: false });
  }
  return { ...menu, products };
}

/** A cart line as it can be ordered now: the menu's price, or why not. */
interface CheckoutLine extends CartLine {
  product: IProduct | null;
  orderable: boolean;
}

/**
 * Checkout (§4.8): the cart's business with its open state, the lines with
 * steppers, where to deliver, a note, the price as the server will charge
 * it and the wallet it is paid from. The page is the payment's review
 * (WCAG 3.3.4): payee, items, fee, total and the balance after are all on
 * it, and Place order repeats the total and the business. The cart lives
 * on this device, so the page reads it (and the business's menu) once it
 * runs.
 */
export default function Checkout() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const cart = useCart();
  useCartSync();
  // After a success the cart is emptied before the tracker opens.
  const [placed, setPlaced] = useState<OrderEntry | null>(null);
  const browseFood = useRef<HTMLAnchorElement>(null);
  // Emptying the cart here takes the form, and the focused button, away:
  // focus moves on to what the empty cart offers.
  const focusEmpty = useRef(false);
  const empty = cart.lines.length === 0;
  useEffect(() => {
    if (focusEmpty.current && empty) browseFood.current?.focus();
    focusEmpty.current = false;
  }, [empty]);

  if (placed) {
    return (
      <p role="status" className="px-4 py-8 text-[15px]">
        Order placed · {orderNumber(placed.order)}. Opening your order…
      </p>
    );
  }
  if (!cart.restored) return <Spinner label="Loading your cart" />;
  if (!cart.business || cart.lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        action={
          <ButtonLink ref={browseFood} href={FOOD_PATH}>
            Browse Food
          </ButtonLink>
        }
      >
        Add something from a menu and it shows up here.
      </EmptyState>
    );
  }

  return (
    <CheckoutForm
      key={cart.business.username}
      cartBusiness={cart.business}
      lines={cart.lines}
      onEmptied={() => {
        focusEmpty.current = true;
      }}
      onPlaced={(entry) => {
        setPlaced(entry);
        // Emptied in this page's store before it is replaced, so the next
        // page starts without it (cart actions don't follow navigations).
        dispatch(cartCleared());
        dispatch(
          showToast({ message: `Order placed · ${orderNumber(entry.order)}` })
        );
        void router.push(orderPath(entry.order.id));
      }}
    />
  );
}

function CheckoutForm({
  cartBusiness,
  lines,
  onEmptied,
  onPlaced,
}: {
  cartBusiness: CartBusiness;
  lines: CartLine[];
  /** About to empty the cart from here. */
  onEmptied: () => void;
  onPlaced: (entry: OrderEntry) => void;
}) {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const walletOn = useAppSelector((state) => state.session.features.wallet);
  const available = useAppSelector(
    (state) => state.wallet.wallet?.available ?? null
  );
  const [menu, setMenu] = useState<Menu>({ state: "loading" });
  const [place, setPlace] = useDeliverTo();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; funds: boolean }>();
  const [said, setSaid] = useState<{ total: number | null; text: string }>({
    total: null,
    text: "",
  });
  const inFlight = useRef(false);
  // Each line's first button, by product, for focus to land on.
  const lineControls = useRef(new Map<string, HTMLButtonElement>());
  const focusLine = useRef<string | null>(null);
  const [bar, setBar] = useState<HTMLDivElement | null>(null);
  useBottomScrollPadding(bar);
  const reasonId = useId();
  const noteId = useId();
  const noteHintId = useId();
  const linesHeadingId = useId();
  const deliveryHeadingId = useId();
  const paymentHeadingId = useId();

  useEffect(() => {
    let cancelled = false;
    loadMenu(cartBusiness.username).then((result) => {
      if (!cancelled) setMenu(result);
    });
    return () => {
      cancelled = true;
    };
  }, [cartBusiness.username]);

  useEffect(() => {
    if (focusLine.current) lineControls.current.get(focusLine.current)?.focus();
    focusLine.current = null;
  }, [lines.length]);

  const reload = () => {
    loadMenu(cartBusiness.username).then(setMenu);
  };

  const lineControl =
    (productId: string) => (button: HTMLButtonElement | null) => {
      if (!button) return;
      lineControls.current.set(productId, button);
      return () => {
        lineControls.current.delete(productId);
      };
    };

  const loaded = menu.state === "loaded" ? menu : null;
  const checkoutLines: CheckoutLine[] = lines.map((line) => {
    const product = loaded?.products.get(line.productId) ?? null;
    return {
      ...line,
      unitPrice: product?.price ?? line.unitPrice,
      product,
      orderable: !!product?.available,
    };
  });
  const orderable = checkoutLines.filter((line) => line.orderable);
  const price = loaded
    ? priceOrder(orderable.map(toPriceLine), loaded.business)
    : null;
  const trimmedNote = note.trim() || null;
  const items = orderable.map(({ productId, quantity }) => ({
    productId,
    quantity,
  }));
  const { key, rotate } = useIdempotencyKey([
    cartBusiness.username,
    JSON.stringify(items),
    place,
    trimmedNote,
    price?.total,
  ]);

  if (menu.state === "loading") return <Spinner label="Loading checkout" />;
  if (menu.state === "gone") {
    return (
      <EmptyState
        title={`${cartBusiness.fullname} isn’t taking orders here anymore`}
        action={
          <Button
            onClick={() => {
              onEmptied();
              dispatch(cartCleared());
            }}
          >
            Clear cart
          </Button>
        }
      >
        Its menu is gone, so this cart can’t be ordered.
      </EmptyState>
    );
  }
  if (menu.state === "failed" || !loaded || !price) {
    return (
      <div className="flex flex-col items-start gap-3 px-4 py-6 text-[15px]">
        <p role="alert">
          {menu.state === "failed" ? menu.message : "Something went wrong."}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setMenu({ state: "loading" });
            reload();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  const { business } = loaded;
  const blocker = orderBlocker({
    readOnly,
    business,
    unavailable: checkoutLines
      .filter((line) => !line.orderable)
      .map((line) => ({ name: line.name, gone: !line.product })),
    removable: true,
    price,
    available,
  });
  const reason = error ?? blocker;
  // A polite total, once the order changes (not when the page opens).
  if (said.total !== price.total) {
    setSaid({
      total: price.total,
      text: said.total === null ? "" : `Total ${formatCredits(price.total)}`,
    });
  }

  // An edit makes the last error out of date.
  const edit = (action: Parameters<typeof dispatch>[0]) => {
    setError(undefined);
    dispatch(action);
  };

  // Remove (or the last "Remove one") takes the line away with the focused
  // button: focus moves on to the line that takes its place, or the one
  // before it. Without either the cart is empty (see Checkout).
  const removeLine = (productId: string) => {
    const index = lines.findIndex((line) => line.productId === productId);
    const neighbour = lines[index + 1] ?? lines[index - 1];
    if (neighbour) focusLine.current = neighbour.productId;
    else onEmptied();
    edit(lineRemoved(productId));
  };

  const submit = async () => {
    if (inFlight.current || blocker) return;
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const entry = await dispatch(
        placeOrder(
          {
            business: business.username,
            items,
            deliveryPlaceId: place,
            note: trimmedNote,
            expectedTotal: price.total,
            sourceTweetId: null,
          },
          key
        )
      );
      rotate();
      writeDeliverTo(place);
      onPlaced(entry);
    } catch (failure) {
      const code = failure instanceof ApiRequestError ? failure.code : null;
      setError({
        message: errorMessage(failure),
        funds: code === "insufficient_funds",
      });
      // The server's prices or availability differ from what is shown.
      // Sold-out items are named in the error: mark those lines. Otherwise
      // (new prices, or the business closed meanwhile) read the menu again,
      // so the lines and total are the ones it means.
      const soldOut = unavailableProducts(failure);
      if (soldOut.length > 0) {
        setMenu((current) => markSoldOut(current, soldOut));
      } else if (code === "price_changed" || code === "unavailable") {
        reload();
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <section className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar user={business} size={48} />
        <div className="min-w-0 flex-1 text-[15px] leading-5">
          <h2 className="truncate text-[17px] font-bold">
            <Link
              href={menuPath(business.username)}
              className="hover:underline"
            >
              {business.fullname}
            </Link>
          </h2>
          <BusinessStatus status={business.status} className="text-muted" />
          <p className="text-[13px] tabular-nums text-muted">
            {deliveryText(business)}
          </p>
        </div>
      </section>

      <section
        aria-labelledby={linesHeadingId}
        className="border-b border-line"
      >
        <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
          <h2 id={linesHeadingId} className="text-xl font-extrabold">
            Your order
          </h2>
          <Link
            href={menuPath(business.username)}
            className="text-[15px] text-primary hover:underline"
          >
            Add items
          </Link>
        </div>
        <ul className="divide-y divide-line">
          {checkoutLines.map((line) => (
            <li
              key={line.productId}
              className="flex items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1 text-[15px] leading-5">
                <p className="font-bold [overflow-wrap:anywhere]">
                  {line.name}
                </p>
                {line.orderable ? (
                  <p className="text-muted">
                    <Money amount={line.unitPrice} /> each
                  </p>
                ) : (
                  <p className="font-bold text-danger">
                    {line.product ? "Sold out" : "No longer available"}
                  </p>
                )}
              </div>
              {line.orderable ? (
                <>
                  <QuantityStepper
                    name={line.name}
                    quantity={line.quantity}
                    max={CART_MAX_QUANTITY}
                    onAdd={() =>
                      edit(
                        itemAdded({
                          business: cartBusiness,
                          product: {
                            id: line.productId,
                            name: line.name,
                            price: line.unitPrice,
                          },
                        })
                      )
                    }
                    onRemove={() =>
                      line.quantity > 1
                        ? edit(itemRemoved(line.productId))
                        : removeLine(line.productId)
                    }
                    removeRef={lineControl(line.productId)}
                  />
                  <Money
                    amount={line.unitPrice * line.quantity}
                    className="w-24 shrink-0 text-right text-[15px]"
                  />
                </>
              ) : (
                <Button
                  ref={lineControl(line.productId)}
                  variant="outline"
                  size="sm"
                  aria-label={`Remove ${line.name}`}
                  onClick={() => removeLine(line.productId)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby={deliveryHeadingId}
        className="flex flex-col gap-4 border-b border-line px-4 py-4 text-[15px]"
      >
        <h2 id={deliveryHeadingId} className="text-xl font-extrabold">
          Delivery
        </h2>
        <PlaceSelect label="Deliver to" value={place} onChange={setPlace} />
        <div>
          <label htmlFor={noteId} className="block font-bold">
            Note <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            rows={2}
            maxLength={LIMITS.order.noteMax}
            aria-describedby={noteHintId}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 w-full resize-y rounded-md border border-line bg-surface px-3 py-2 focus:border-primary focus:outline-none"
          />
          <p id={noteHintId} className="mt-1 text-[13px] text-muted">
            For {business.fullname}, up to {LIMITS.order.noteMax} characters.
          </p>
        </div>
      </section>

      <section
        aria-labelledby={paymentHeadingId}
        className="flex flex-col gap-3 px-4 py-4 text-[15px]"
      >
        <h2 id={paymentHeadingId} className="text-xl font-extrabold">
          Payment
        </h2>
        <PriceSummary price={price} />
        {walletOn && (
          <div className="flex flex-col gap-1 rounded-2xl bg-subtle px-4 py-3">
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="font-bold">SuperApp Wallet</span>
              <DemoBadge />
            </p>
            {available !== null && (
              <p className="text-muted">
                <Money amount={available} /> available
                {price.total <= available && (
                  <>
                    {" · "}After this order{" "}
                    <Money amount={available - price.total} />
                  </>
                )}
              </p>
            )}
          </div>
        )}
        <p className="text-[13px] text-muted">Demo credits · no cash value</p>
        {error ? (
          <p
            id={reasonId}
            role="alert"
            className="rounded-md border border-danger px-3 py-2 text-danger"
          >
            {error.message}
            {error.funds && <AddCredits />}
          </p>
        ) : (
          blocker && (
            <p id={reasonId} className="text-danger">
              {blocker.message}
              {blocker.funds && <AddCredits />}
            </p>
          )
        )}
        <p aria-live="polite" className="sr-only">
          {said.text}
        </p>
      </section>

      <div
        ref={setBar}
        className="sticky bottom-[calc(53px+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface px-4 py-3 xs:bottom-0"
      >
        <Button
          size="lg"
          aria-disabled={busy || !!blocker || undefined}
          aria-busy={busy}
          aria-describedby={reason ? reasonId : undefined}
          onClick={submit}
          className="w-full gap-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          {busy && (
            <span
              aria-hidden="true"
              className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          <span className="min-w-0 truncate">
            Place order · {formatCredits(price.total)}
            <span className="sr-only"> to {business.fullname}</span>
          </span>
        </Button>
      </div>
    </>
  );
}

function AddCredits() {
  return (
    <>
      {" "}
      <Link href="/wallet" className="font-bold underline underline-offset-2">
        Add credits
      </Link>
    </>
  );
}

const toPriceLine = (line: CheckoutLine): PriceLine => ({
  productId: line.productId,
  name: line.name,
  unitPrice: line.unitPrice,
  quantity: line.quantity,
});
