import { IBusiness, IBusinessStatus } from "./Business";
import { Cents } from "./Money";

// Skeleton declared by the foundation; the shop lane completes it.

export interface IProduct {
  id: string;
  business: string;
  section: string;
  name: string;
  description: string | null;
  price: Cents;
  image: string | null;
  imageAlt: string | null;
  available: boolean;
  position: number;
}

export interface IMenuSection {
  title: string;
  products: IProduct[];
}

export interface IProductCard {
  id: string;
  name: string;
  price: Cents;
  image: string | null;
  imageAlt: string | null;
  available: boolean;
  business: {
    username: string;
    fullname: string;
    image: string | null;
    status: IBusinessStatus;
    etaMinutes: [number, number];
  };
}

export interface IBusinessSummary extends Pick<
  IBusiness,
  | "username"
  | "fullname"
  | "image"
  | "banner"
  | "category"
  | "placeId"
  | "deliveryFee"
  | "status"
  | "etaMinutes"
> {
  /** Top 3 product names. */
  highlights: string[];
}

// Response bodies of the shop endpoints (docs/api/shop.md).

export interface BusinessSummariesResponse {
  items: IBusinessSummary[];
}

export interface BusinessMenuResponse {
  business: IBusiness;
  menu: IMenuSection[];
}

export interface BusinessResponse {
  business: IBusiness;
}

export interface ProductDetailResponse {
  product: IProduct;
  card: IProductCard;
}

export interface ProductResponse {
  product: IProduct;
}

export interface ProductsResponse {
  items: IProduct[];
}
