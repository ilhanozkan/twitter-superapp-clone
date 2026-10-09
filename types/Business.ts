import { Cents } from "./Money";
import { PlaceId } from "./Superapp";

export type AccountType = "personal" | "business";

export type BusinessCategory = "cafe" | "restaurant" | "healthy" | "shop";

/** "HH:MM" in `timeZone`. closes < opens wraps past midnight; equal means 24 hours. */
export interface IBusinessHours {
  opens: string;
  closes: string;
  timeZone: string;
}

export interface IBusinessStatus {
  open: boolean;
  /** open && acceptingOrders && wallet not frozen */
  orderable: boolean;
  reason: "closed" | "paused" | "frozen" | null;
  /** "Open 24 hours", "Open now · Closes 02:00", "Closed · Opens 11:00", "Not taking orders right now" */
  label: string;
  /** ISO */
  opensAt: string | null;
  closesAt: string | null;
}

export interface IBusiness {
  /** username, fullname and image come from the user record. */
  username: string;
  fullname: string;
  image: string | null;
  banner: string | null;
  category: BusinessCategory;
  description: string | null;
  placeId: PlaceId;
  address: string;
  hours: IBusinessHours;
  acceptingOrders: boolean;
  prepMinutes: number;
  deliveryMinutes: number;
  deliveryFee: Cents;
  minimumOrder: Cents;
  greeting: string | null;
  managers: string[];
  /** Derived at read (now, wallet freeze). */
  status: IBusinessStatus;
  /** [prep + delivery, prep + delivery + 3] */
  etaMinutes: [number, number];
}
