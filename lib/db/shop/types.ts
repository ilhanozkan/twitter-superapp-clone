import { BusinessCategory } from "../../../types/Business";
import {
  IBusinessSummary,
  IMenuSection,
  IProduct,
  IProductCard,
} from "../../../types/Shop";
import { FeatureRepository } from "../types";

// Skeleton declared by the foundation; the shop lane implements it.

export interface ShopRepository extends FeatureRepository {
  /** F-declared (tweet decoration); stub: empty. */
  getProductCards(ids: string[]): Promise<Map<string, IProductCard>>;
  /** F-declared (attachment validation); stub: null. */
  getProduct(id: string): Promise<IProduct | null>;
  getProducts(ids: string[]): Promise<IProduct[]>;
  listBusinessSummaries(query?: {
    category?: BusinessCategory;
  }): Promise<IBusinessSummary[]>;
  /** Sections by first position, products by position. */
  getMenu(username: string): Promise<IMenuSection[]>;
  /** Available products of businesses `username` manages (C1) + products from their delivered orders (added by C2). */
  listAttachableProducts(username: string): Promise<IProduct[]>;
  /** NotFoundError */
  setProductAvailability(id: string, available: boolean): Promise<IProduct>;
}
