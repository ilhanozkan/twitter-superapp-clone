import { PUBLISHED } from "./groq";

// GROQ for businesses: a public businessProfile document plus the user
// record it belongs to (name, avatar, accountType) and the wallet freeze
// that makes it not orderable. Profiles are matched by lower-cased username.

const PROFILE_FIELDS = `
  _id,
  username,
  "banner": banner,
  category,
  "description": description,
  placeId,
  "address": coalesce(address, ""),
  "hours": { "opens": opens, "closes": closes, "timeZone": coalesce(timeZone, "Europe/Istanbul") },
  "acceptingOrders": acceptingOrders != false,
  "prepMinutes": coalesce(prepMinutes, 0),
  "deliveryMinutes": coalesce(deliveryMinutes, 0),
  "deliveryFee": coalesce(deliveryFee, 0),
  "minimumOrder": coalesce(minimumOrder, 0),
  "greeting": greeting,
  "managers": coalesce(managers, []),
  "user": *[_type == "user" && lower(username) == lower(^.username) && ${PUBLISHED}][0]{
    username, "fullname": coalesce(fullname, username), "image": image, "accountType": coalesce(accountType, "personal")
  },
  "frozen": count(*[_type == "walletFreeze" && lower(username) == lower(^.username) && ${PUBLISHED}]) > 0
`;

export const BUSINESS_QUERY = `*[_type == "businessProfile" && lower(username) == $username && ${PUBLISHED}][0]{${PROFILE_FIELDS}}`;

export const BUSINESSES_QUERY = `*[_type == "businessProfile" && ${PUBLISHED}]{${PROFILE_FIELDS}}`;
