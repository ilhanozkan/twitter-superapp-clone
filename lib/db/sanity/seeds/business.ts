import { SeedData } from "../../seed";
import { compact, SanitySeedDocument } from "./documents";

/** Business profiles are public, live-edited documents with deterministic ids. */
export function businessProfileId(username: string): string {
  return `businessProfile-${username.toLowerCase()}`;
}

export function businessSanityDocuments(seed: SeedData): SanitySeedDocument[] {
  const joinedAt = new Map(
    seed.users.map((user) => [user.username.toLowerCase(), user.joinedAt])
  );

  return (seed.superapp?.business.profiles ?? []).map((profile) => {
    const createdAt = joinedAt.get(profile.username.toLowerCase());
    if (!createdAt) {
      throw new Error(
        `Business profile for unknown user "${profile.username}"`
      );
    }
    return compact({
      _id: businessProfileId(profile.username),
      _type: "businessProfile",
      _createdAt: createdAt,
      username: profile.username,
      category: profile.category,
      description: profile.description,
      placeId: profile.placeId,
      address: profile.address,
      opens: profile.hours.opens,
      closes: profile.hours.closes,
      timeZone: profile.hours.timeZone,
      acceptingOrders: profile.acceptingOrders,
      prepMinutes: profile.prepMinutes,
      deliveryMinutes: profile.deliveryMinutes,
      deliveryFee: profile.deliveryFee,
      minimumOrder: profile.minimumOrder,
      greeting: profile.greeting,
      managers: profile.managers,
      banner: profile.banner,
    });
  });
}
