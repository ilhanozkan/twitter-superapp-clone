import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HiCheck, HiOutlineShoppingBag } from "react-icons/hi2";

import { errorMessage } from "../../lib/client/api";
import { shopApi } from "../../lib/client/shopApi";
import { formatCredits } from "../../lib/superapp/money";
import { IProduct } from "../../types/Shop";
import { TweetAttachmentInput } from "../../types/Tweet";
import { Button, ButtonLink } from "../common/Button";
import Dialog from "../common/Dialog";
import Spinner from "../common/Spinner";
import AttachmentPreview from "./AttachmentPreview";
import { FOOD_PATH } from "./paths";
import ProductThumb from "./ProductThumb";

export interface ComposerProductPickerProps {
  /** The product attached to the Tweet being written, if any. */
  attachment: TweetAttachmentInput | null;
  onChange: (attachment: TweetAttachmentInput | null) => void;
}

type List =
  | { state: "loading" }
  | { state: "loaded"; items: IProduct[] }
  | { state: "failed"; message: string };

// The server has no layout: layout effects only run in the browser.
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Slot (§12.3): "Attach a product" in the composer's toolbar. It suggests
 * the viewer's own products (businesses they manage; the orders feature
 * adds what they ordered), though the server lets any Tweet carry any
 * available product, like a link. The attached product previews above the
 * toolbar with a Remove button.
 */
export default function ComposerProductPicker({
  attachment,
  onChange,
}: ComposerProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<List>({ state: "loading" });
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  // The composer gives this slot a place in its toolbar only; a preview
  // belongs above the toolbar, where an image field goes. It is rendered
  // into this element, placed right before the toolbar row.
  const [slot] = useState(() =>
    typeof document === "undefined" ? null : document.createElement("div")
  );
  const toolbar = button?.closest("form")
    ? (button.parentElement?.parentElement ?? null)
    : null;
  const attached = attachment !== null;

  useIsomorphicLayoutEffect(() => {
    if (!slot || !toolbar?.parentElement || !attached) return;
    toolbar.before(slot);
    return () => slot.remove();
  }, [slot, toolbar, attached]);

  const load = () => {
    setList({ state: "loading" });
    shopApi.listAttachable().then(
      ({ items }) => setList({ state: "loaded", items }),
      (reason) => setList({ state: "failed", message: errorMessage(reason) })
    );
  };

  const choose = (product: IProduct) => {
    onChange({ type: "product", productId: product.id });
    setOpen(false);
  };

  const preview =
    attachment && button ? (
      <AttachmentPreview
        productId={attachment.productId}
        onRemove={() => {
          onChange(null);
          // The preview is gone: keep focus in the toolbar.
          button.focus();
        }}
      />
    ) : null;

  return (
    <>
      <button
        ref={setButton}
        type="button"
        aria-label="Attach a product"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          load();
        }}
        className="rounded-full p-2 text-xl text-primary transition-colors hover:bg-primary/10"
      >
        <HiOutlineShoppingBag aria-hidden="true" />
      </button>
      {preview &&
        (slot && toolbar?.parentElement
          ? createPortal(preview, slot)
          : preview)}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Attach a product"
      >
        {list.state === "loading" && <Spinner label="Loading products" />}
        {list.state === "failed" && (
          <div className="flex flex-col items-start gap-3 py-2 text-[15px]">
            <p role="alert">{list.message}</p>
            <Button variant="outline" onClick={load}>
              Retry
            </Button>
          </div>
        )}
        {list.state === "loaded" && list.items.length === 0 && (
          <div className="flex flex-col items-start gap-4 py-2 text-[15px]">
            <p className="text-muted">
              Products from businesses you manage or have ordered from appear
              here.
            </p>
            <ButtonLink
              href={FOOD_PATH}
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Browse Food
            </ButtonLink>
          </div>
        )}
        {list.state === "loaded" && list.items.length > 0 && (
          <ul className="-mx-2 flex flex-col">
            {list.items.map((product) => {
              const current = product.id === attachment?.productId;
              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => choose(product)}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-fg/5"
                  >
                    <ProductThumb image={product.image} alt={null} size={48} />
                    <span className="min-w-0 flex-1 text-[15px] leading-5">
                      <span className="block truncate font-bold">
                        {product.name}
                      </span>
                      <span className="block truncate text-muted">
                        @{product.business} ·{" "}
                        <span className="tabular-nums">
                          {formatCredits(product.price)}
                        </span>
                      </span>
                    </span>
                    {current && (
                      <>
                        <HiCheck
                          aria-hidden="true"
                          className="shrink-0 text-xl text-primary"
                        />
                        <span className="sr-only">(attached)</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </>
  );
}
