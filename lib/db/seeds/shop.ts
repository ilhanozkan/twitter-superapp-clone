import { IProduct } from "../../../types/Shop";
import { LaneSeed, SeedContext, SeedReaction, SeedTweet } from "./types";

/** The menus of the foundation's four businesses. */
export interface ShopSeed {
  products: IProduct[];
}

const HOUR = 60;

// [id, section, name, description, price in cents, art, alt text, available]
type ProductRow = [
  string,
  string,
  string,
  string,
  number,
  string,
  string,
  boolean?,
];

// Menus in order: a product's position is its place on its business's menu.
const menus: Record<string, ProductRow[]> = {
  kizilaykahve: [
    [
      "seed-p-kk-turkish",
      "Coffee",
      "Türk kahvesi",
      "Finely ground and slowly brewed in a copper cezve, with lokum.",
      350,
      "turkish-coffee",
      "A small cup of Turkish coffee with foam on top, next to a piece of lokum",
    ],
    [
      "seed-p-kk-latte",
      "Coffee",
      "Pistachio latte",
      "Espresso, steamed milk and Antep pistachio cream.",
      500,
      "pistachio-latte",
      "A tall glass of pale green pistachio latte topped with crushed pistachios",
    ],
    [
      "seed-p-kk-coldbrew",
      "Coffee",
      "Cold brew",
      "Steeped for 18 hours, served over ice.",
      450,
      "cold-brew",
      "A glass of dark cold brew coffee with ice cubes and a straw",
    ],
    [
      "seed-p-kk-simit",
      "Bakery",
      "Simit",
      "The sesame-crusted bread ring, baked this morning.",
      250,
      "simit",
      "A golden simit bread ring covered in sesame seeds",
    ],
    [
      "seed-p-kk-cheesecake",
      "Bakery",
      "San Sebastian cheesecake",
      "Burnt on top, creamy inside.",
      600,
      "cheesecake",
      "A slice of San Sebastian cheesecake with a dark caramelized top",
    ],
  ],
  lahmacunlab: [
    [
      "seed-p-ll-lahmacun",
      "Mains",
      "Lahmacun",
      "Thin and crispy, with parsley, onion and extra lemon.",
      400,
      "lahmacun",
      "A thin, round lahmacun topped with minced meat, parsley and a lemon wedge",
    ],
    [
      "seed-p-ll-adana",
      "Mains",
      "Adana kebab",
      "Hand-minced lamb on lavash, with grilled pepper and tomato.",
      1100,
      "adana-kebab",
      "An Adana kebab on lavash bread with a grilled green pepper and a tomato",
    ],
    [
      "seed-p-ll-mercimek",
      "Soups",
      "Mercimek çorbası",
      "Red lentil soup with chili butter.",
      350,
      "lentil-soup",
      "A bowl of orange red lentil soup with a swirl of chili butter",
    ],
    [
      "seed-p-ll-ayran",
      "Drinks",
      "Ayran",
      "Cold, salted yogurt drink.",
      150,
      "ayran",
      "A frothy glass of ayran",
    ],
    [
      "seed-p-ll-kunefe",
      "Desserts",
      "Künefe",
      "Warm shredded pastry with melted cheese and syrup.",
      650,
      "kunefe",
      "A round künefe of crispy orange shredded pastry topped with pistachio",
    ],
  ],
  bowlandco: [
    [
      "seed-p-bc-falafel",
      "Bowls",
      "Falafel bowl",
      "Crispy falafel, hummus, pickled cabbage and tahini.",
      900,
      "falafel-bowl",
      "A bowl of falafel with hummus, purple pickled cabbage and greens",
    ],
    [
      "seed-p-bc-quinoa",
      "Bowls",
      "Quinoa salad",
      "Quinoa, cucumber, tomato, mint and pomegranate.",
      850,
      "quinoa-salad",
      "A bowl of quinoa salad with cucumber, tomato and pomegranate seeds",
    ],
    [
      "seed-p-bc-lemonade",
      "Drinks",
      "Fresh lemonade",
      "Squeezed to order, with mint.",
      300,
      "lemonade",
      "A glass of lemonade with a slice of lemon and mint leaves",
    ],
  ],
  superapp: [
    [
      "seed-p-sa-stickers",
      "Merch",
      "Sticker pack",
      "Six vinyl stickers for your laptop.",
      300,
      "stickers",
      "A sheet of six colourful SuperApp stickers",
    ],
    [
      "seed-p-sa-mug",
      "Merch",
      "SuperApp mug",
      "A 350 ml ceramic mug with the SuperApp mark.",
      1200,
      "mug",
      "A blue ceramic mug with the SuperApp logo",
    ],
    [
      "seed-p-sa-hoodie",
      "Merch",
      "Hoodie",
      "Heavyweight cotton with an embroidered logo.",
      3500,
      "hoodie",
      "A navy hoodie with an embroidered SuperApp logo",
      false,
    ],
  ],
};

const products = (): IProduct[] =>
  Object.entries(menus).flatMap(([business, rows]) =>
    rows.map(
      (
        [id, section, name, description, price, art, alt, available = true],
        index
      ): IProduct => ({
        id,
        business,
        section,
        name,
        description,
        price,
        image: `/media/menu/${art}.svg`,
        imageAlt: alt,
        available,
        position: index + 1,
      })
    )
  );

// tweet id -> who liked it, in order
const likes: Record<string, string[]> = {
  "seed-t22": ["foodie_ankara", "sarahcodes", "ayse_design"],
  "seed-t23": ["foodie_ankara", "devmarco"],
  "seed-t24": ["lenaframes", "ayse_design"],
  "seed-t25": ["illlhanozkan", "sarahcodes", "nightowl_dev"],
};

/**
 * C1's part of the world: the businesses' menus (art in
 * public/media/menu/), one Tweet per business with a product card, a reply
 * and likes on those Tweets.
 */
export function createShopSeed({ at }: SeedContext): LaneSeed<ShopSeed> {
  const tweet = (
    id: string,
    author: string,
    minutesAgo: number,
    productId: string,
    text: string
  ): SeedTweet => ({
    id,
    text,
    image: null,
    createdAt: at(minutesAgo),
    author,
    blocked: false,
    attachment: { type: "product", productId },
  });

  const tweets = [
    tweet(
      "seed-t22",
      "kizilaykahve",
      50,
      "seed-p-kk-latte",
      "New on the menu: pistachio latte ☕ Order it right from this Tweet, delivered around Kızılay in about 10 minutes. #Coffee #Ankara"
    ),
    tweet(
      "seed-t23",
      "lahmacunlab",
      150,
      "seed-p-ll-lahmacun",
      // A link right under the header's would make both too small a
      // target (axe target-size): the mention comes later in the text.
      "Thin, crispy, extra lemon. We might be biased 😄 but @foodie_ankara asked for the best lahmacun in Ankara. #Food #Ankara"
    ),
    tweet(
      "seed-t24",
      "bowlandco",
      5 * HOUR,
      "seed-p-bc-falafel",
      "The falafel bowl is back: crispy falafel, hummus, pickled cabbage, tahini 🥙 #Food"
    ),
    tweet(
      "seed-t25",
      "superapp",
      26 * HOUR,
      "seed-p-sa-stickers",
      "The SuperApp store is open: stickers, mugs and hoodies delivered across Ankara. #SuperApp"
    ),
  ];
  const postedAt = new Map(
    tweets.map((item) => [item.id, Date.parse(item.createdAt)])
  );

  // A minute apart, from a minute after the Tweet.
  const reactions = Object.entries(likes).flatMap(([tweetId, usernames]) =>
    usernames.map((username, index): SeedReaction => ({
      kind: "like",
      tweetId,
      username,
      createdAt: new Date(
        postedAt.get(tweetId)! + (index + 1) * 60_000
      ).toISOString(),
    }))
  );

  return {
    data: { products: products() },
    contribution: {
      tweets,
      replies: [
        {
          id: "seed-r11",
          tweetId: "seed-t22",
          text: "Ordered from the Tweet. Two taps. This is the future 😮‍💨",
          createdAt: at(35),
          author: "foodie_ankara",
        },
      ],
      reactions,
    },
  };
}
