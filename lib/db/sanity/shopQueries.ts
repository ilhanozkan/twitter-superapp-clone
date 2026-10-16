import { PUBLISHED } from "./groq";

// GROQ for products: public, live-edited documents. The business side
// (name, avatar, status) comes from F's business reads, never from here, so
// a product only carries the username of its business as typed in Studio.

const PRODUCT_FIELDS = `
  "id": _id,
  business,
  section,
  name,
  description,
  price,
  image,
  imageAlt,
  "available": available != false,
  "position": coalesce(position, 0)
`;

const products = (filter: string) =>
  `*[_type == "product" && ${filter}${PUBLISHED}]{${PRODUCT_FIELDS}}`;

/** $ids: product ids. */
export const PRODUCTS_BY_ID_QUERY = products("_id in $ids && ");

/** $businesses: lower-cased usernames. */
export const PRODUCTS_OF_QUERY = products("lower(business) in $businesses && ");

export const ALL_PRODUCTS_QUERY = products("");
