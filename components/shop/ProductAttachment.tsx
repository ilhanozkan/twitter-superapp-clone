import Link from "next/link";
import { MouseEvent, useId } from "react";
import { HiOutlineShoppingBag } from "react-icons/hi2";

import { openDialog } from "../../slices/uiSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IProductCard } from "../../types/Shop";
import { ITweet } from "../../types/Tweet";
import { Button, ButtonLink } from "../common/Button";
import Money from "../superapp/Money";
import { cardBusinessLine, READ_ONLY_ORDERING } from "./format";
import { menuPath } from "./paths";
import ProductThumb from "./ProductThumb";
import SoldOutBadge from "./SoldOutBadge";

export interface ProductAttachmentProps {
  tweet: ITweet;
  /** In a timeline card, or on the Tweet's own page. */
  variant: "card" | "detail";
}

const keepInCard = (event: MouseEvent) => event.stopPropagation();

/** Why Order now is off for this card, or null when it can be ordered. */
function orderBlocker(card: IProductCard, readOnly: boolean): string | null {
  if (readOnly) return READ_ONLY_ORDERING;
  if (!card.available) return "Sold out";
  if (!card.business.status.orderable) return card.business.status.label;
  return null;
}

/**
 * Slot (§12.3): the product card attached to a Tweet, with Order now (the
 * orders feature's quick order, hidden until it is on) and View menu. Its
 * controls are real buttons and links, which TweetCard leaves alone. A
 * product deleted since says so; the whole attachment is null while the
 * shop is off.
 */
export default function ProductAttachment({
  tweet,
  variant,
}: ProductAttachmentProps) {
  const dispatch = useAppDispatch();
  const ordersOn = useAppSelector((state) => state.session.features.orders);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const reasonId = useId();
  const attachment = tweet.attachment;
  if (!attachment) return null;

  const card = attachment.product;
  if (!card) {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-2xl border border-line px-4 py-3 text-[15px] text-muted">
        <HiOutlineShoppingBag aria-hidden="true" className="shrink-0 text-lg" />
        This item is no longer available
      </p>
    );
  }

  const blocker = orderBlocker(card, readOnly);
  const detail = variant === "detail";

  return (
    <div
      role="group"
      aria-label={`Product: ${card.name}`}
      className="mt-3 overflow-hidden rounded-2xl border border-line"
    >
      <div className="flex gap-3 p-3">
        <ProductThumb
          image={card.image}
          alt={card.imageAlt}
          size={detail ? 96 : 72}
        />
        <div className="min-w-0 flex-1 text-[15px] leading-5">
          <p className="font-bold [overflow-wrap:anywhere]">
            <Link
              href={menuPath(card.business.username, card.id)}
              className="hover:underline"
            >
              {card.name}
            </Link>
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <Money amount={card.price} />
            {!card.available && <SoldOutBadge />}
          </p>
          <p className="mt-1 text-[13px] leading-4 text-muted [overflow-wrap:anywhere]">
            {cardBusinessLine(card)}
          </p>
        </div>
      </div>
      {/* A disabled button lets clicks through to this row (it has no
          pointer events), and TweetCard opens the Tweet on a click that
          isn't on a control: the row keeps them. */}
      <div
        onClick={keepInCard}
        onAuxClick={keepInCard}
        className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2"
      >
        {ordersOn && (
          <Button
            size="sm"
            disabled={!!blocker}
            aria-describedby={blocker ? reasonId : undefined}
            onClick={() =>
              dispatch(
                openDialog("quickOrder", {
                  productId: card.id,
                  tweetId: tweet.id,
                })
              )
            }
          >
            Order now
          </Button>
        )}
        <ButtonLink
          size="sm"
          variant="outline"
          href={menuPath(card.business.username)}
        >
          View menu
        </ButtonLink>
        {ordersOn && blocker && (
          <p id={reasonId} className="text-[13px] text-muted">
            {blocker}
          </p>
        )}
      </div>
    </div>
  );
}
