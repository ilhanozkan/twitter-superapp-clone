import { useEffect, useState } from "react";
import { HiXMark } from "react-icons/hi2";

import { ApiRequestError } from "../../lib/client/api";
import { shopApi } from "../../lib/client/shopApi";
import { IProductCard } from "../../types/Shop";
import Money from "../superapp/Money";
import { cardBusinessLine } from "./format";
import ProductThumb from "./ProductThumb";
import SoldOutBadge from "./SoldOutBadge";

type Loaded =
  | { id: string; card: IProductCard }
  | { id: string; card: null; problem: "gone" | "failed" };

/**
 * The product a Tweet being written carries, as its card will show, with a
 * Remove button. It is read by id, because the composer may start with one
 * (e.g. "Tweet about it" after an order) that the picker never listed.
 */
export default function AttachmentPreview({
  productId,
  onRemove,
}: {
  productId: string;
  onRemove: () => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    let cancelled = false;
    shopApi.getProduct(productId).then(
      ({ card }) => {
        if (!cancelled) setLoaded({ id: productId, card });
      },
      (reason) => {
        if (cancelled) return;
        const gone = reason instanceof ApiRequestError && reason.status === 404;
        setLoaded({
          id: productId,
          card: null,
          problem: gone ? "gone" : "failed",
        });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [productId]);

  // A result for the product attached before this one doesn't count.
  const current = loaded?.id === productId ? loaded : null;
  const card = current?.card ?? null;
  const message = !current
    ? "Loading the product…"
    : "problem" in current && current.problem === "gone"
      ? "This item is no longer available"
      : "This product can’t be shown right now.";

  return (
    <div
      role="group"
      aria-label="Attached product"
      aria-busy={!current}
      className="mb-3 flex items-center gap-3 rounded-2xl border border-line p-3 text-[15px] leading-5"
    >
      {card ? (
        <>
          <ProductThumb image={card.image} alt={card.imageAlt} size={56} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{card.name}</p>
            <p className="flex flex-wrap items-center gap-2">
              <Money amount={card.price} />
              {!card.available && <SoldOutBadge />}
            </p>
            <p className="truncate text-[13px] leading-4 text-muted">
              {cardBusinessLine(card)}
            </p>
          </div>
        </>
      ) : (
        <p className="min-w-0 flex-1 text-muted">{message}</p>
      )}
      <button
        type="button"
        aria-label={card ? `Remove ${card.name}` : "Remove the product"}
        onClick={onRemove}
        className="-m-1 shrink-0 self-start rounded-full p-2 text-xl transition-colors hover:bg-fg/10"
      >
        <HiXMark aria-hidden="true" />
      </button>
    </div>
  );
}
