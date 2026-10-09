import { IBusiness } from "../../types/Business";
import { IProduct } from "../../types/Shop";
import Dialog from "../common/Dialog";
import Money from "../superapp/Money";
import AddToCart from "./AddToCart";
import BusinessStatus from "./BusinessStatus";
import { deliveryText } from "./format";
import ProductThumb from "./ProductThumb";
import SoldOutBadge from "./SoldOutBadge";

interface ProductDialogProps {
  /** The product to show; null keeps the dialog closed. */
  product: IProduct | null;
  business: IBusiness;
  onClose: () => void;
  orderingDisabled?: boolean;
  reasonId?: string;
}

/** A product's details, opened from its menu (addressable as `?product=<id>`). */
export default function ProductDialog({
  product,
  business,
  onClose,
  orderingDisabled = false,
  reasonId,
}: ProductDialogProps) {
  return (
    <Dialog
      open={!!product}
      onClose={onClose}
      title={product?.name ?? "Product"}
      variant="sheet"
    >
      {product && (
        <div className="flex flex-col gap-3 text-[15px]">
          <ProductThumb
            image={product.image}
            alt={product.imageAlt}
            className="mx-auto aspect-square w-full max-w-[280px]"
          />
          {product.description && <p>{product.description}</p>}
          <p className="flex flex-wrap items-center gap-2 text-[17px] font-bold">
            <Money amount={product.price} />
            {!product.available && <SoldOutBadge />}
          </p>
          <div className="flex flex-col gap-1 text-muted">
            <p className="font-bold text-fg">{business.fullname}</p>
            <BusinessStatus status={business.status} />
            <p className="tabular-nums">{deliveryText(business)}</p>
          </div>
          <div className="empty:hidden">
            <AddToCart
              product={product}
              business={business}
              disabled={orderingDisabled}
              reasonId={reasonId}
            />
          </div>
        </div>
      )}
    </Dialog>
  );
}
