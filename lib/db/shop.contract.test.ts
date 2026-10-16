import { existsSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";

import { FakeSanityClient } from "../../test/fakeSanityClient";
import {
  expectStoresAgree,
  Subject,
  SUBJECT_NOW,
  subjects,
} from "../../test/repositorySubjects";
import { STUDIO_LIMITS } from "../../sanity/env";
import { IProduct, IProductCard } from "../../types/Shop";
import { PRODUCT_LIMITS } from "../superapp/shop";
import { ConfigurationError, NotFoundError } from "./errors";
import { KEY_PATTERN } from "./sanity/ids";
import { createSanityRepository } from "./sanity/repository";
import { seedToSanityDocuments } from "./sanity/seed";
import { createSeedData, DEMO_USERNAME } from "./seed";
import { Repository } from "./types";

// Products, menus and product cards on both stores. Subjects start at
// 2026-10-08T12:00Z, 15:00 in Europe/Istanbul: every business is open.
// Products are Studio documents, so tests add and delete them the way an
// editor would, around the app.

const OPEN_24_HOURS = {
  open: true,
  orderable: true,
  reason: null,
  label: "Open 24 hours",
  opensAt: null,
  closesAt: null,
};

const latte: IProduct = {
  id: "seed-p-kk-latte",
  business: "kizilaykahve",
  section: "Coffee",
  name: "Pistachio latte",
  description: "Espresso, steamed milk and Antep pistachio cream.",
  price: 500,
  image: "/media/menu/pistachio-latte.svg",
  imageAlt:
    "A tall glass of pale green pistachio latte topped with crushed pistachios",
  available: true,
  position: 2,
};

const latteCard: IProductCard = {
  id: "seed-p-kk-latte",
  name: "Pistachio latte",
  price: 500,
  image: "/media/menu/pistachio-latte.svg",
  imageAlt: latte.imageAlt,
  available: true,
  business: {
    username: "kizilaykahve",
    fullname: "Kızılay Kahve",
    image: "/avatars/kizilaykahve.svg",
    status: OPEN_24_HOURS,
    etaMinutes: [9, 12],
  },
};

const me = {
  username: DEMO_USERNAME,
  fullname: "Ilhan Ozkan",
  image: "/avatars/illlhanozkan.svg",
};

const product = (fields: Partial<IProduct> & { id: string }): IProduct => ({
  ...latte,
  name: "Test product",
  description: null,
  image: null,
  imageAlt: null,
  ...fields,
});

/** Adds a product the way a Studio editor would (live-edited, so published at once). */
function addProduct(subject: Subject, item: IProduct) {
  if (subject.state) {
    subject.state.shop.products.set(item.id, { ...item });
    return;
  }
  const { id, ...fields } = item;
  const now = subject.clock.now().toISOString();
  subject.client!.documents.push({
    _id: id,
    _type: "product",
    _createdAt: now,
    _updatedAt: now,
    _rev: `studio-${id}`,
    ...Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== null)
    ),
  });
}

/** Deletes a product in Studio. */
function deleteProduct(subject: Subject, id: string) {
  if (subject.state) subject.state.shop.products.delete(id);
  else
    subject.client!.documents = subject.client!.documents.filter(
      (document) => document._id !== id
    );
}

const ids = (products: IProduct[]) => products.map((item) => item.id);

describe.each(subjects())("%s shop", (_name, create) => {
  let subject: Subject;
  let repo: Repository;

  beforeEach(() => {
    subject = create();
    repo = subject.repo;
  });

  it("is on and has no notifications or live activity of its own", async () => {
    expect(repo.featureStatus("shop")).toBe("on");
    expect(repo.features.shop).toBe(true);
    expect(await repo.shop.notifications(DEMO_USERNAME, 10)).toEqual([]);
    expect(await repo.shop.liveActivity(DEMO_USERNAME)).toEqual([]);
  });

  describe("menus", () => {
    it("lists sections in order of their first product, products by position", async () => {
      const menu = await repo.shop.getMenu("KizilayKahve");

      expect(menu.map(({ title, products }) => [title, ids(products)])).toEqual(
        [
          [
            "Coffee",
            ["seed-p-kk-turkish", "seed-p-kk-latte", "seed-p-kk-coldbrew"],
          ],
          ["Bakery", ["seed-p-kk-simit", "seed-p-kk-cheesecake"]],
        ]
      );
      expect(menu[0].products[1]).toEqual(latte);
    });

    it("moves a section up with its first product and breaks position ties by id", async () => {
      addProduct(
        subject,
        product({ id: "studio-b", section: "Specials", position: 0 })
      );
      addProduct(
        subject,
        product({ id: "studio-a", section: "Specials", position: 0 })
      );
      addProduct(
        subject,
        product({ id: "studio-c", section: "Bakery", position: 1 })
      );

      const menu = await repo.shop.getMenu("kizilaykahve");
      expect(menu.map(({ title, products }) => [title, ids(products)])).toEqual(
        [
          ["Specials", ["studio-a", "studio-b"]],
          [
            "Coffee",
            ["seed-p-kk-turkish", "seed-p-kk-latte", "seed-p-kk-coldbrew"],
          ],
          ["Bakery", ["studio-c", "seed-p-kk-simit", "seed-p-kk-cheesecake"]],
        ]
      );
    });

    it("shows sold-out products on the menu", async () => {
      const merch = await repo.shop.getMenu("superapp");
      expect(merch).toHaveLength(1);
      expect(
        merch[0].products.map(({ name, available }) => [name, available])
      ).toEqual([
        ["Sticker pack", true],
        ["SuperApp mug", true],
        ["Hoodie", false],
      ]);
    });

    it("has no menu for people or unknown accounts", async () => {
      for (const username of [DEMO_USERNAME, "ahmet_drives", "ghost"]) {
        expect(await repo.shop.getMenu(username), username).toEqual([]);
      }
    });
  });

  describe("products", () => {
    it("reads a product by id, and several in the order asked", async () => {
      expect(await repo.shop.getProduct("seed-p-kk-latte")).toEqual(latte);
      expect(await repo.shop.getProduct("missing")).toBeNull();

      expect(
        ids(
          await repo.shop.getProducts([
            "seed-p-sa-mug",
            "missing",
            "seed-p-kk-latte",
            "seed-p-sa-mug",
          ])
        )
      ).toEqual(["seed-p-sa-mug", "seed-p-kk-latte"]);
      expect(await repo.shop.getProducts([])).toEqual([]);
    });

    it("hides products of accounts that aren't businesses", async () => {
      addProduct(
        subject,
        product({ id: "studio-person", business: "sarahcodes" })
      );
      addProduct(subject, product({ id: "studio-ghost", business: "ghost" }));

      for (const id of ["studio-person", "studio-ghost"]) {
        expect(await repo.shop.getProduct(id), id).toBeNull();
      }
      expect(
        await repo.shop.getProductCards(["studio-person", "studio-ghost"])
      ).toEqual(new Map());
      expect(await repo.shop.getMenu("sarahcodes")).toEqual([]);
    });

    it("hides a product until Studio has its name, section and a valid price", async () => {
      const incomplete = [
        product({ id: "studio-1", name: "" }),
        product({ id: "studio-2", section: "  " }),
        product({ id: "studio-3", price: 0 }),
        product({ id: "studio-4", price: 9 }),
        product({ id: "studio-5", price: 20_001 }),
        product({ id: "studio-6", price: 4.5 }),
      ];
      for (const item of incomplete) addProduct(subject, item);

      expect(await repo.shop.getProducts(ids(incomplete))).toEqual([]);
      expect(
        ids(
          (await repo.shop.getMenu("kizilaykahve")).flatMap((s) => s.products)
        )
      ).not.toContain("studio-1");

      addProduct(subject, product({ id: "studio-7", price: 10 }));
      expect(await repo.shop.getProduct("studio-7")).toMatchObject({
        price: 10,
      });
    });

    it("names the business by its own username, whatever the case in Studio", async () => {
      addProduct(
        subject,
        product({ id: "studio-case", business: "KizilayKahve" })
      );
      expect(await repo.shop.getProduct("studio-case")).toMatchObject({
        business: "kizilaykahve",
      });
    });

    it("hides a product whose business has stray spaces from every read", async () => {
      // Studio flags such a username but still publishes it (live edit).
      const padded = [
        product({
          id: "studio-pad-end",
          business: "superapp ",
          section: "Merch",
          name: "Padded cap",
          position: -1,
        }),
        product({
          id: "studio-pad-start",
          business: " superapp",
          section: "Merch",
          name: "Padded tote",
          position: -1,
        }),
      ];
      for (const item of padded) addProduct(subject, item);
      const padIds = ids(padded);

      for (const id of padIds) {
        expect(await repo.shop.getProduct(id), id).toBeNull();
        await expect(
          repo.shop.setProductAvailability(id, false),
          id
        ).rejects.toBeInstanceOf(NotFoundError);
      }
      expect(await repo.shop.getProducts(padIds)).toEqual([]);
      expect(await repo.shop.getProductCards(padIds)).toEqual(new Map());
      expect(
        ids((await repo.shop.getMenu("superapp")).flatMap((s) => s.products))
      ).toEqual(["seed-p-sa-stickers", "seed-p-sa-mug", "seed-p-sa-hoodie"]);
      expect(
        ids(await repo.shop.listAttachableProducts(DEMO_USERNAME))
      ).toEqual(["seed-p-sa-stickers", "seed-p-sa-mug"]);
      const summaries = await repo.shop.listBusinessSummaries();
      expect(
        summaries.find((s) => s.username === "superapp")!.highlights
      ).toEqual(["Sticker pack", "SuperApp mug"]);
    });
  });

  describe("product cards on Tweets", () => {
    it("resolves the card of a Tweet's product", async () => {
      expect(
        (await repo.getTweet("seed-t22", DEMO_USERNAME))!.attachment
      ).toEqual({ type: "product", product: latteCard });

      const { items } = await repo.listTweets({ author: "superapp" });
      expect(
        items.find((tweet) => tweet.id === "seed-t25")!.attachment
      ).toEqual({
        type: "product",
        product: {
          id: "seed-p-sa-stickers",
          name: "Sticker pack",
          price: 300,
          image: "/media/menu/stickers.svg",
          imageAlt: "A sheet of six colourful SuperApp stickers",
          available: true,
          business: {
            username: "superapp",
            fullname: "Twitter SuperApp",
            image: "/avatars/superapp.svg",
            status: OPEN_24_HOURS,
            etaMinutes: [180, 183],
          },
        },
      });
      // Tweets without a product have no attachment.
      expect(
        items.find((tweet) => tweet.id === "seed-t21")!.attachment
      ).toBeNull();
    });

    it("reads cards in one batch, keyed by product id", async () => {
      const cards = await repo.shop.getProductCards([
        "seed-p-kk-latte",
        "seed-p-ll-lahmacun",
        "missing",
        "seed-p-kk-latte",
      ]);
      expect([...cards.keys()]).toEqual([
        "seed-p-kk-latte",
        "seed-p-ll-lahmacun",
      ]);
      expect(cards.get("seed-p-kk-latte")).toEqual(latteCard);
      expect(cards.get("seed-p-ll-lahmacun")!.business).toMatchObject({
        username: "lahmacunlab",
        status: { label: "Open now · Closes 04:00" },
        etaMinutes: [14, 17],
      });
      expect(await repo.shop.getProductCards([])).toEqual(new Map());
    });

    it("shows the business as it is now: paused, frozen or closed", async () => {
      await repo.business.setAcceptingOrders("kizilaykahve", false);
      subject.freeze("superapp", true);
      subject.clock.set("2026-10-09T02:00:00.000Z"); // 05:00 in Istanbul

      const cards = await repo.shop.getProductCards([
        "seed-p-kk-latte",
        "seed-p-sa-mug",
        "seed-p-ll-lahmacun",
      ]);
      expect(cards.get("seed-p-kk-latte")!.business.status).toMatchObject({
        orderable: false,
        reason: "paused",
        label: "Not taking orders right now",
      });
      expect(cards.get("seed-p-sa-mug")!.business.status).toMatchObject({
        orderable: false,
        reason: "frozen",
      });
      expect(cards.get("seed-p-ll-lahmacun")!.business.status).toMatchObject({
        open: false,
        reason: "closed",
        label: "Closed · Opens 11:00",
      });
    });

    it("reads a deleted product as product: null", async () => {
      deleteProduct(subject, "seed-p-kk-latte");

      expect((await repo.getTweet("seed-t22"))!.attachment).toEqual({
        type: "product",
        product: null,
      });
      expect(await repo.shop.getProduct("seed-p-kk-latte")).toBeNull();
    });

    it("decorates a new Tweet with its product's card", async () => {
      const tweet = await repo.createTweet({
        text: "Two taps ☕",
        author: me,
        attachment: { type: "product", productId: "seed-p-kk-latte" },
      });
      expect(tweet.attachment).toEqual({ type: "product", product: latteCard });
      expect(
        (await repo.getTweet(tweet.id, DEMO_USERNAME))!.attachment
      ).toEqual(tweet.attachment);
    });
  });

  describe("availability", () => {
    it("marks a product sold out and back, everywhere it shows", async () => {
      const soldOut = await repo.shop.setProductAvailability(
        "seed-p-sa-mug",
        false
      );
      expect(soldOut).toMatchObject({ id: "seed-p-sa-mug", available: false });
      expect(await repo.shop.getProduct("seed-p-sa-mug")).toEqual(soldOut);
      expect(
        (await repo.shop.getProductCards(["seed-p-sa-mug"])).get(
          "seed-p-sa-mug"
        )!.available
      ).toBe(false);
      expect(
        (await repo.shop.getMenu("superapp"))[0].products[1].available
      ).toBe(false);
      expect(
        ids(await repo.shop.listAttachableProducts(DEMO_USERNAME))
      ).toEqual(["seed-p-sa-stickers"]);

      const back = await repo.shop.setProductAvailability(
        "seed-p-sa-mug",
        true
      );
      expect(back).toEqual({ ...soldOut, available: true });
      expect(await repo.shop.getProduct("seed-p-sa-mug")).toEqual(back);
    });

    it("is idempotent", async () => {
      await repo.shop.setProductAvailability("seed-p-sa-hoodie", false);
      expect(
        await repo.shop.setProductAvailability("seed-p-sa-hoodie", false)
      ).toMatchObject({ available: false });
    });

    it("refuses unknown and hidden products", async () => {
      addProduct(
        subject,
        product({ id: "studio-person", business: "sarahcodes" })
      );
      for (const id of ["missing", "studio-person"]) {
        await expect(
          repo.shop.setProductAvailability(id, false),
          id
        ).rejects.toBeInstanceOf(NotFoundError);
      }
    });
  });

  describe("business summaries", () => {
    it("lists every business by name with its status and first available products", async () => {
      const summaries = await repo.shop.listBusinessSummaries();

      expect(summaries.map((s) => s.username)).toEqual([
        "bowlandco",
        "kizilaykahve",
        "lahmacunlab",
        "superapp",
      ]);
      expect(summaries[1]).toEqual({
        username: "kizilaykahve",
        fullname: "Kızılay Kahve",
        image: "/avatars/kizilaykahve.svg",
        banner: "/media/banner-kizilaykahve.svg",
        category: "cafe",
        placeId: "kizilay",
        deliveryFee: 150,
        status: OPEN_24_HOURS,
        etaMinutes: [9, 12],
        highlights: ["Türk kahvesi", "Pistachio latte", "Cold brew"],
      });
      // The sold-out hoodie isn't a highlight.
      expect(summaries[3].highlights).toEqual(["Sticker pack", "SuperApp mug"]);
    });

    it("filters by category", async () => {
      const usernames = async (
        category: "cafe" | "restaurant" | "healthy" | "shop"
      ) =>
        (await repo.shop.listBusinessSummaries({ category })).map(
          (s) => s.username
        );
      expect(await usernames("cafe")).toEqual(["kizilaykahve"]);
      expect(await usernames("restaurant")).toEqual(["lahmacunlab"]);
      expect(await usernames("healthy")).toEqual(["bowlandco"]);
      expect(await usernames("shop")).toEqual(["superapp"]);
    });

    it("derives each status from the clock, pauses and freezes", async () => {
      subject.clock.set("2026-10-09T02:00:00.000Z"); // 05:00 in Istanbul
      await repo.business.setAcceptingOrders("superapp", false);
      subject.freeze("kizilaykahve", true);

      const status = Object.fromEntries(
        (await repo.shop.listBusinessSummaries()).map((s) => [
          s.username,
          [s.status.reason, s.status.label],
        ])
      );
      expect(status).toEqual({
        bowlandco: ["closed", "Closed · Opens 09:00"],
        kizilaykahve: ["frozen", "Not taking orders right now"],
        lahmacunlab: ["closed", "Closed · Opens 11:00"],
        superapp: ["paused", "Not taking orders right now"],
      });
    });
  });

  describe("attachable products", () => {
    it("lists the available products of the businesses a user runs", async () => {
      // The demo user manages @superapp; the hoodie is sold out.
      expect(
        ids(await repo.shop.listAttachableProducts(DEMO_USERNAME.toUpperCase()))
      ).toEqual(["seed-p-sa-stickers", "seed-p-sa-mug"]);
      expect(
        ids(await repo.shop.listAttachableProducts("KizilayKahve"))
      ).toEqual([
        "seed-p-kk-turkish",
        "seed-p-kk-latte",
        "seed-p-kk-coldbrew",
        "seed-p-kk-simit",
        "seed-p-kk-cheesecake",
      ]);
      expect(await repo.shop.listAttachableProducts("sarahcodes")).toEqual([]);
    });
  });

  it("has an empty shop in the core world", async () => {
    const [, createCore] = subjects({ world: "core" }).find(
      ([name]) => name === _name
    )!;
    const core = createCore().repo;

    expect(core.featureStatus("shop")).toBe("on");
    expect(await core.shop.listBusinessSummaries()).toEqual([]);
    expect(await core.shop.getMenu("superapp")).toEqual([]);
    expect(await core.shop.getProduct("seed-p-kk-latte")).toBeNull();
    expect(await core.shop.listAttachableProducts(DEMO_USERNAME)).toEqual([]);
  });
});

describe("sanity shop", () => {
  const documents = () =>
    seedToSanityDocuments(createSeedData(SUBJECT_NOW, { world: "superapp" }));

  it("stays readable without a token and refuses writes", async () => {
    const client = new FakeSanityClient(documents(), () => SUBJECT_NOW);
    const repo = createSanityRepository(client, {
      canWrite: false,
      now: () => SUBJECT_NOW,
    });

    expect(repo.featureStatus("shop")).toBe("on");
    expect(await repo.shop.getProduct("seed-p-kk-latte")).toEqual(latte);
    await expect(
      repo.shop.setProductAvailability("seed-p-kk-latte", false)
    ).rejects.toBeInstanceOf(ConfigurationError);
    expect(client.mutationLog).toEqual([]);
  });

  it("toggles availability with one patch of the published document", async () => {
    const [, create] = subjects().find(([name]) => name === "sanity")!;
    const { repo, client } = create();

    await repo.shop.setProductAvailability("seed-p-sa-mug", false);
    expect(client!.mutationLog).toEqual([
      [{ patch: { id: "seed-p-sa-mug", set: { available: false } } }],
    ]);
  });

  it("reads Studio's blanks as null, drops unsafe images and ignores drafts", async () => {
    const [, create] = subjects().find(([name]) => name === "sanity")!;
    const subject = create();
    const now = SUBJECT_NOW.toISOString();
    const studio = { _createdAt: now, _updatedAt: now, _rev: "studio" };
    subject.client!.documents.push(
      {
        ...studio,
        _id: "studio-blank",
        _type: "product",
        business: "kizilaykahve",
        section: " Coffee ",
        name: "Filter coffee",
        description: "   ",
        price: 300,
        image: "javascript:alert(1)",
        imageAlt: "",
      },
      {
        ...studio,
        _id: "drafts.seed-p-kk-latte",
        _type: "product",
        business: "kizilaykahve",
        section: "Coffee",
        name: "Draft latte",
        price: 100,
      }
    );

    expect(await subject.repo.shop.getProduct("studio-blank")).toEqual({
      id: "studio-blank",
      business: "kizilaykahve",
      section: "Coffee",
      name: "Filter coffee",
      description: null,
      price: 300,
      image: null,
      imageAlt: null,
      available: true,
      position: 0,
    });
    expect(
      await subject.repo.shop.getProducts([
        "seed-p-kk-latte",
        "drafts.seed-p-kk-latte",
      ])
    ).toEqual([latte]);
  });
});

describe("stores agree on the shop", () => {
  it("after availability, pause, freeze and clock changes", async () => {
    const productIds = [
      "seed-p-kk-latte",
      "seed-p-ll-lahmacun",
      "seed-p-bc-falafel",
      "seed-p-sa-mug",
      "seed-p-sa-hoodie",
      "missing",
    ];
    await expectStoresAgree(
      async (repo: Repository) => ({
        summaries: await repo.shop.listBusinessSummaries(),
        cafes: await repo.shop.listBusinessSummaries({ category: "cafe" }),
        menus: await Promise.all(
          ["kizilaykahve", "lahmacunlab", "bowlandco", "superapp"].map(
            (username) => repo.shop.getMenu(username)
          )
        ),
        cards: [...(await repo.shop.getProductCards(productIds))],
        products: await repo.shop.getProducts(productIds),
        attachable: await repo.shop.listAttachableProducts(DEMO_USERNAME),
        tweets: (await repo.listTweets({ limit: 50 })).items.filter(
          (tweet) => tweet.attachment
        ),
      }),
      {
        prepare: async (subject) => {
          subject.clock.set("2026-10-08T19:30:00.000Z");
          await subject.repo.shop.setProductAvailability(
            "seed-p-sa-mug",
            false
          );
          await subject.repo.shop.setProductAvailability(
            "seed-p-sa-hoodie",
            true
          );
          await subject.repo.business.setAcceptingOrders("lahmacunlab", false);
          subject.freeze("bowlandco", true);
        },
      }
    );
  });
});

describe("C1 seed", () => {
  const world = createSeedData(SUBJECT_NOW);
  const products = world.superapp!.shop!.products;
  const users = new Map(world.users.map((user) => [user.username, user]));
  const profiles = new Set(
    world.superapp!.business.profiles.map((profile) => profile.username)
  );
  const byId = new Map(products.map((item) => [item.id, item]));

  it("gives each of F's businesses a menu with the products the spec names", () => {
    const count = (business: string) =>
      products.filter((item) => item.business === business).length;
    expect(
      [...profiles].map((business) => [business, count(business)])
    ).toEqual([
      ["kizilaykahve", 5],
      ["lahmacunlab", 5],
      ["bowlandco", 3],
      ["superapp", 3],
    ]);
    expect(
      Object.fromEntries(
        [
          "seed-p-kk-latte",
          "seed-p-kk-simit",
          "seed-p-ll-lahmacun",
          "seed-p-bc-falafel",
          "seed-p-sa-stickers",
          "seed-p-sa-mug",
          "seed-p-sa-hoodie",
        ].map((id) => [id, [byId.get(id)!.price, byId.get(id)!.available]])
      )
    ).toEqual({
      "seed-p-kk-latte": [500, true],
      "seed-p-kk-simit": [250, true],
      "seed-p-ll-lahmacun": [400, true],
      "seed-p-bc-falafel": [900, true],
      "seed-p-sa-stickers": [300, true],
      "seed-p-sa-mug": [1_200, true],
      "seed-p-sa-hoodie": [3_500, false],
    });
  });

  it("only references F's businesses and its own Tweets", () => {
    for (const item of products) {
      expect(profiles.has(item.business), item.id).toBe(true);
      expect(users.get(item.business)!.accountType, item.id).toBe("business");
    }

    const productTweets = world.tweets.filter((tweet) => tweet.attachment);
    expect(productTweets.map((tweet) => tweet.id)).toEqual([
      "seed-t22",
      "seed-t23",
      "seed-t24",
      "seed-t25",
    ]);
    for (const tweet of productTweets) {
      // Each business tweets about one of its own products.
      expect(byId.get(tweet.attachment!.productId)!.business, tweet.id).toBe(
        tweet.author
      );
    }

    const ours = new Set(productTweets.map((tweet) => tweet.id));
    expect(
      world.replies.find((reply) => reply.id === "seed-r11")
    ).toMatchObject({ tweetId: "seed-t22", author: "foodie_ankara" });
    const likes = world.reactions.filter((r) => ours.has(r.tweetId));
    expect(likes.length).toBeGreaterThanOrEqual(ours.size);
    for (const like of likes) {
      expect(like.kind).toBe("like");
      expect(users.has(like.username), like.username).toBe(true);
    }
    for (const tweetId of ours) {
      expect(
        likes.some((like) => like.tweetId === tweetId),
        tweetId
      ).toBe(true);
    }
  });

  it("keeps links off the start of its Tweets", () => {
    // The first line of a Tweet sits right under the header's links (name,
    // handle, time), ~40 characters wide: a mention or hashtag there makes
    // them too small a target (axe target-size, WCAG 2.5.8).
    for (const tweet of world.tweets.filter((item) => item.attachment)) {
      const firstLink = tweet.text.search(/[@#]|https?:/);
      expect(firstLink, tweet.id).toBeGreaterThanOrEqual(40);
    }
  });

  it("passes the Studio's product rules, which equal the app's", () => {
    expect(STUDIO_LIMITS.product).toEqual(PRODUCT_LIMITS);
    const length = (value: string | null) => Array.from(value ?? "").length;
    const limits = STUDIO_LIMITS.product;

    expect(byId.size).toBe(products.length);
    for (const item of products) {
      expect(item.id).toMatch(KEY_PATTERN);
      expect(length(item.name), item.id).toBeGreaterThan(0);
      expect(length(item.name), item.id).toBeLessThanOrEqual(limits.nameMax);
      expect(length(item.description), item.id).toBeLessThanOrEqual(
        limits.descriptionMax
      );
      expect(Number.isInteger(item.price), item.id).toBe(true);
      expect(item.price, item.id).toBeGreaterThanOrEqual(limits.price.min);
      expect(item.price, item.id).toBeLessThanOrEqual(limits.price.max);
      expect(Number.isInteger(item.position), item.id).toBe(true);
      // Every product has its own art, described for people who can't see it.
      expect(item.image, item.id).toMatch(/^\/media\/menu\/[a-z-]+\.svg$/);
      expect(
        existsSync(path.join(__dirname, "../../public", item.image!))
      ).toBe(true);
      expect(length(item.imageAlt), item.id).toBeGreaterThan(0);
      expect(length(item.imageAlt), item.id).toBeLessThanOrEqual(
        limits.imageAltMax
      );
    }
    expect(new Set(products.map((item) => item.image)).size).toBe(
      products.length
    );
  });

  it("exports products as public Studio documents", () => {
    const documents = seedToSanityDocuments(world).filter(
      (document) => document._type === "product"
    );
    expect(documents).toHaveLength(products.length);
    expect(documents.find((d) => d._id === "seed-p-sa-hoodie")).toEqual({
      _id: "seed-p-sa-hoodie",
      _type: "product",
      _createdAt: users.get("superapp")!.joinedAt,
      business: "superapp",
      section: "Merch",
      name: "Hoodie",
      description: "Heavyweight cotton with an embroidered logo.",
      price: 3_500,
      image: "/media/menu/hoodie.svg",
      imageAlt: "A navy hoodie with an embroidered SuperApp logo",
      available: false,
      position: 3,
    });
  });
});
