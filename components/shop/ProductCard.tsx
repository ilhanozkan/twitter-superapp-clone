import Link from "next/link";

import { CartBusiness } from "../../slices/cartSlice";
import { IProduct } from "../../types/Shop";
import Money from "../superapp/Money";
import AddToCart from "./AddToCart";
import ProductThumb from "./ProductThumb";
import SoldOutBadge from "./SoldOutBadge";

interface ProductCardProps {
  product: IProduct;
  business: CartBusiness;
  /** Its details dialog (`?product=`), opened in place. */
  detailsHref: string;
  onOpenDetails?: () => void;
  /** Ordering is off for everything on the page, for the reason `reasonId` states. */
  orderingDisabled?: boolean;
  reasonId?: string;
}

/** A product on a menu: name, description, price, picture and Add. */
export default function ProductCard({
  product,
  business,
  detailsHref,
  onOpenDetails,
  orderingDisabled = false,
  reasonId,
}: ProductCardProps) {
  return (
    <div className="flex gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-bold leading-5 [overflow-wrap:anywhere]">
          <Link
            href={detailsHref}
            shallow
            scroll={false}
            onClick={onOpenDetails}
            className="hover:underline"
          >
            {product.name}
          </Link>
        </h3>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-[15px] leading-5 text-muted">
            {product.description}
          </p>
        )}
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px]">
          <Money amount={product.price} />
          {!product.available && <SoldOutBadge />}
        </p>
        <div className="mt-2 empty:hidden">
          <AddToCart
            product={product}
            business={business}
            disabled={orderingDisabled}
            reasonId={reasonId}
          />
        </div>
      </div>
      <ProductThumb image={product.image} alt={product.imageAlt} size={88} />
    </div>
  );
}
