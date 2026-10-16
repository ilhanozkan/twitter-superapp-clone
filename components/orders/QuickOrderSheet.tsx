import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { ApiRequestError, errorMessage } from "../../lib/client/api";
import { shopApi } from "../../lib/client/shopApi";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { LIMITS } from "../../lib/superapp/limits";
import { formatCredits } from "../../lib/superapp/money";
import { priceOrder } from "../../lib/superapp/orders";
import { getPlace } from "../../lib/superapp/places";
import { CART_MAX_QUANTITY } from "../../slices/cartSlice";
import { OrderEntry, placeOrder } from "../../slices/ordersSlice";
import { showToast } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IBusiness } from "../../types/Business";
import { IProduct } from "../../types/Shop";
import { Button, ButtonLink } from "../common/Button";
import Spinner from "../common/Spinner";
import BusinessStatus from "../shop/BusinessStatus";
import ProductThumb from "../shop/ProductThumb";
import QuantityStepper from "../shop/QuantityStepper";
import SoldOutBadge from "../shop/SoldOutBadge";
import LocalTime from "../superapp/LocalTime";
import Money from "../superapp/Money";
import PaymentConfirm from "../superapp/PaymentConfirm";
import PlaceSelect from "../superapp/PlaceSelect";
import { orderBlocker, unavailableProducts } from "./blockers";
import { useDeliverTo, writeDeliverTo } from "./deliverTo";
import { orderNumber, orderPath } from "./format";
import PriceSummary from "./PriceSummary";

type Load =
  | { state: "loading" }
  | { state: "loaded"; business: IBusiness; product: IProduct }
  | { state: "gone" }
  | { state: "failed"; message: string };

/** The product as its business's menu has it now (price, availability). */
async function loadProduct(productId: string): Promise<Load> {
  try {
    const { card } = await shopApi.getProduct(productId);
    const { business, menu } = await shopApi.getBusiness(
      card.business.username
    );
    const product = menu
      .flatMap((section) => section.products)
      .find((item) => item.id === productId);
    return product ? { state: "loaded", business, product } : { state: "gone" };
  } catch (reason) {
    return reason instanceof ApiRequestError && reason.status === 404
      ? { state: "gone" }
      : { state: "failed", message: errorMessage(reason) };
  }
}

/**
 * Order now (§4.8, "two taps"): one product from a Tweet's card, with a
 * quantity, where to deliver and a note; then the payment review
 * (PaymentConfirm, WCAG 3.3.4) and "Order placed" with Track order. The
 * sheet keeps one Idempotency-Key per order it describes, so Back and Pay
 * again with nothing changed retries the same order instead of placing
 * another.
 */
export default function QuickOrderSheet({
  productId,
  tweetId,
  onClose,
}: {
  productId: string;
  /** The Tweet whose card it was opened from (credited on the order). */
  tweetId: string | null;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const available = useAppSelector(
    (state) => state.wallet.wallet?.available ?? null
  );
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [quantity, setQuantity] = useState(1);
  const [place, setPlace] = useDeliverTo();
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [placed, setPlaced] = useState<OrderEntry | null>(null);
  const payButton = useRef<HTMLButtonElement>(null);
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<"pay" | "done" | null>(null);
  const reasonId = useId();
  const noteId = useId();
  const noteHintId = useId();

  useEffect(() => {
    let cancelled = false;
    loadProduct(productId).then((result) => {
      if (!cancelled) setLoad(result);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    if (focusNext.current === "pay") payButton.current?.focus();
    if (focusNext.current === "done") doneHeading.current?.focus();
    focusNext.current = null;
  }, [step]);

  const loaded = load.state === "loaded" ? load : null;
  const price = loaded
    ? priceOrder(
        [
          {
            productId,
            name: loaded.product.name,
            unitPrice: loaded.product.price,
            quantity,
          },
        ],
        loaded.business
      )
    : null;
  const trimmedNote = note.trim() || null;
  const { key, rotate } = useIdempotencyKey([
    productId,
    quantity,
    place,
    trimmedNote,
    price?.total,
  ]);

  const reload = () => {
    setLoad({ state: "loading" });
    loadProduct(productId).then(setLoad);
  };

  if (step === "done" && placed) {
    const { order } = placed;
    return (
      <div className="flex flex-col gap-4 text-[15px]">
        <div>
          <h3
            ref={doneHeading}
            tabIndex={-1}
            className="text-xl font-bold leading-7 focus:outline-none"
          >
            Order placed · {orderNumber(order)}
          </h3>
          <p className="mt-1 text-muted">
            Arrives around <LocalTime iso={order.deliverAt} /> ·{" "}
            {order.business.fullname}
          </p>
        </div>
        <ButtonLink size="lg" href={orderPath(order.id)} onClick={onClose}>
          Track order
        </ButtonLink>
        <Button variant="outline" size="lg" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }

  if (load.state === "loading") return <Spinner label="Loading the item" />;
  if (load.state === "gone") {
    return (
      <p className="py-4 text-[15px]">This item is no longer available.</p>
    );
  }
  if (load.state === "failed" || !loaded || !price) {
    return (
      <div className="flex flex-col items-start gap-3 py-2 text-[15px]">
        <p role="alert">
          {load.state === "failed" ? load.message : "Something went wrong."}
        </p>
        <Button variant="outline" onClick={reload}>
          Retry
        </Button>
      </div>
    );
  }

  const { business, product } = loaded;
  const blocker = orderBlocker({
    readOnly,
    business,
    unavailable: product.available ? [] : [{ name: product.name, gone: false }],
    price,
    available,
  });

  const submit = async () => {
    try {
      const entry = await dispatch(
        placeOrder(
          {
            business: business.username,
            items: [{ productId, quantity }],
            deliveryPlaceId: place,
            note: trimmedNote,
            expectedTotal: price.total,
            sourceTweetId: tweetId,
          },
          key
        )
      );
      setPlaced(entry);
      writeDeliverTo(place);
      dispatch(
        showToast({
          message: `Order placed · ${orderNumber(entry.order)}`,
          action: { label: "Track", href: orderPath(entry.order.id) },
        })
      );
    } catch (reason) {
      // Prices or availability moved on: show them as they are now (the
      // review stays open with the server's message). A sold-out item is
      // named in the error; anything else (new prices, the business closed
      // meanwhile) is read again.
      if (unavailableProducts(reason).includes(productId)) {
        setLoad((current) =>
          current.state === "loaded"
            ? { ...current, product: { ...current.product, available: false } }
            : current
        );
      } else if (
        reason instanceof ApiRequestError &&
        (reason.code === "price_changed" || reason.code === "unavailable")
      ) {
        loadProduct(productId).then(setLoad);
      }
      throw reason;
    }
  };

  if (step === "review") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-muted">
          {product.name} ×{quantity} · Deliver to {getPlace(place).name}
        </p>
        <PaymentConfirm
          action="Pay"
          payee={business}
          amount={price.subtotal}
          fee={price.deliveryFee}
          note={trimmedNote}
          onConfirm={submit}
          onDone={() => {
            rotate();
            focusNext.current = "done";
            setStep("done");
          }}
          onBack={() => {
            focusNext.current = "pay";
            setStep("form");
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-[15px]">
      <div className="flex gap-3">
        <ProductThumb image={product.image} alt={product.imageAlt} size={72} />
        <div className="min-w-0 flex-1 leading-5">
          <p className="font-bold [overflow-wrap:anywhere]">{product.name}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <Money amount={product.price} />
            {!product.available && <SoldOutBadge />}
          </p>
          <p className="mt-1 text-[13px] text-muted">{business.fullname}</p>
          <BusinessStatus
            status={business.status}
            className="text-[13px] text-muted"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">Quantity</span>
        <QuantityStepper
          name={product.name}
          label={`Quantity of ${product.name}`}
          quantity={quantity}
          min={1}
          max={CART_MAX_QUANTITY}
          onAdd={() =>
            setQuantity((value) => Math.min(CART_MAX_QUANTITY, value + 1))
          }
          onRemove={() => setQuantity((value) => Math.max(1, value - 1))}
        />
      </div>

      <PlaceSelect label="Deliver to" value={place} onChange={setPlace} />

      <div>
        <label htmlFor={noteId} className="block font-bold">
          Note <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id={noteId}
          value={note}
          maxLength={LIMITS.order.noteMax}
          aria-describedby={noteHintId}
          onChange={(event) => setNote(event.target.value)}
          className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 focus:border-primary focus:outline-none"
        />
        <p id={noteHintId} className="mt-1 text-[13px] text-muted">
          For {business.fullname}, up to {LIMITS.order.noteMax} characters.
        </p>
      </div>

      <PriceSummary price={price} />
      {available !== null && (
        <p className="text-muted">
          From your available <Money amount={available} />
        </p>
      )}

      {blocker && (
        <p id={reasonId} className="text-danger">
          {blocker.message}
          {blocker.funds && (
            <>
              {" "}
              <Link
                href="/wallet"
                onClick={onClose}
                className="font-bold underline underline-offset-2"
              >
                Add credits
              </Link>
            </>
          )}
        </p>
      )}

      <Button
        ref={payButton}
        size="lg"
        data-autofocus
        aria-disabled={!!blocker || undefined}
        aria-describedby={blocker ? reasonId : undefined}
        onClick={() => {
          if (!blocker) setStep("review");
        }}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
      >
        Pay {formatCredits(price.total)}
      </Button>
      <p className="text-[13px] text-muted">Demo credits · no cash value</p>
    </div>
  );
}
