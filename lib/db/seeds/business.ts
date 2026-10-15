import { BusinessProfile } from "../business/types";
import { LaneSeed, SeedContext } from "./types";

export interface BusinessSeed {
  profiles: BusinessProfile[];
}

const ISTANBUL = "Europe/Istanbul";

const profiles: BusinessProfile[] = [
  {
    username: "kizilaykahve",
    banner: "/media/banner-kizilaykahve.svg",
    category: "cafe",
    description:
      "Turkish coffee, pistachio lattes and fresh simit in the heart of Kızılay.",
    placeId: "kizilay",
    address: "Kızılay Square, Çankaya, Ankara",
    hours: { opens: "00:00", closes: "00:00", timeZone: ISTANBUL },
    acceptingOrders: true,
    prepMinutes: 3,
    deliveryMinutes: 6,
    deliveryFee: 150,
    minimumOrder: 300,
    greeting:
      "Merhaba! 👋 This is Kızılay Kahve's automatic greeting. You can order from our menu anytime.",
    managers: [],
  },
  {
    username: "lahmacunlab",
    banner: "/media/banner-lahmacunlab.svg",
    category: "restaurant",
    description: "Thin, crispy lahmacun and Anatolian classics, until late.",
    placeId: "ulus",
    address: "Ulus Square, Altındağ, Ankara",
    hours: { opens: "11:00", closes: "04:00", timeZone: ISTANBUL },
    acceptingOrders: true,
    prepMinutes: 6,
    deliveryMinutes: 8,
    deliveryFee: 200,
    minimumOrder: 500,
    greeting: null,
    managers: [],
  },
  {
    username: "bowlandco",
    banner: "/media/banner-bowlandco.svg",
    category: "healthy",
    description: "Fresh bowls, salads and lemonade.",
    placeId: "tunali",
    address: "Tunalı Hilmi Street, Kavaklıdere, Ankara",
    hours: { opens: "09:00", closes: "21:00", timeZone: ISTANBUL },
    acceptingOrders: true,
    prepMinutes: 5,
    deliveryMinutes: 7,
    deliveryFee: 150,
    minimumOrder: 0,
    greeting: null,
    managers: [],
  },
  {
    username: "superapp",
    banner: "/media/banner-superapp.svg",
    category: "shop",
    description:
      "The official SuperApp store: stickers, mugs and hoodies delivered across Ankara.",
    placeId: "kizilay",
    address: "Kızılay, Çankaya, Ankara",
    hours: { opens: "00:00", closes: "00:00", timeZone: ISTANBUL },
    acceptingOrders: true,
    prepMinutes: 60,
    deliveryMinutes: 120,
    deliveryFee: 300,
    minimumOrder: 0,
    greeting: null,
    managers: ["illlhanozkan"],
  },
];

/** The business profiles; their accounts are in ./users (and core's @superapp). */
export const createBusinessSeed: (
  ctx: SeedContext
) => LaneSeed<BusinessSeed> = () => ({
  data: { profiles: profiles.map((profile) => ({ ...profile })) },
  contribution: {},
});
