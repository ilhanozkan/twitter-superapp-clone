export type FeatureId =
  "wallet" | "messages" | "channels" | "shop" | "orders" | "rides" | "stories";

export type IFeatures = Record<FeatureId, boolean>;

export type FeatureStatus = "on" | "off" | "unconfigured";

export type PlaceId =
  | "kizilay"
  | "tunali"
  | "atakule"
  | "anitkabir"
  | "odtu"
  | "esenboga"
  | "ulus"
  | "bahcelievler"
  | "kale"
  | "genclik"
  | "asti";

export interface IPlace {
  id: PlaceId;
  name: string;
  area: string;
  lat: number;
  lng: number;
}

export interface IStage<S extends string> {
  status: S;
  label: string;
  at: string;
  reached: boolean;
}

export interface ILiveActivity {
  kind: "order" | "ride";
  id: string;
  /** "Order from Kızılay Kahve", "Ride to Atakule" */
  title: string;
  /** "On the way" */
  status: string;
  /** ISO; the client formats "arrives 14:35". */
  eta: string | null;
  href: string;
  nextChangeAt: string | null;
}
