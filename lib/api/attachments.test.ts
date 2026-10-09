import { describe, expect, it } from "vitest";

import { UnavailableError } from "../db/errors";
import { IProduct } from "../../types/Shop";
import { checkAttachment } from "./attachments";
import { ApiError } from "./errors";

const latte: IProduct = {
  id: "seed-p-kk-latte",
  business: "kizilaykahve",
  section: "Coffee",
  name: "Pistachio latte",
  description: null,
  price: 500,
  image: null,
  imageAlt: null,
  available: true,
  position: 1,
};

const repo = (shop: boolean, products: IProduct[] = []) =>
  ({
    features: { shop },
    shop: {
      getProduct: async (id: string) =>
        products.find((product) => product.id === id) ?? null,
    },
  }) as unknown as Parameters<typeof checkAttachment>[0];

const product = (productId: string) => ({
  type: "product" as const,
  productId,
});

describe("checkAttachment", () => {
  it("accepts an available product", async () => {
    await expect(
      checkAttachment(repo(true, [latte]), product(latte.id))
    ).resolves.toEqual(product(latte.id));
  });

  it("refuses attachments while the shop is off", async () => {
    await expect(
      checkAttachment(repo(false, [latte]), product(latte.id))
    ).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
      details: [
        {
          path: "attachment",
          message: "Products can't be attached on this site",
        },
      ],
    });
  });

  it("404s for an unknown product", async () => {
    const error = await checkAttachment(repo(true), product("missing")).catch(
      (caught: unknown) => caught
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, code: "not_found" });
  });

  it("names a sold-out product", async () => {
    const error = await checkAttachment(
      repo(true, [{ ...latte, available: false }]),
      product(latte.id)
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnavailableError);
    expect(error).toMatchObject({
      message: "Pistachio latte is sold out",
      productIds: [latte.id],
    });
  });
});
