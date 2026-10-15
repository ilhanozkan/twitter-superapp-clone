import { describe, expect, it } from "vitest";

import { featureRepositories, resolveFeatures } from "./features";
import {
  unbuiltBusiness,
  unbuiltChannels,
  unbuiltMessages,
  unbuiltOrders,
  unbuiltRides,
  unbuiltShop,
  unbuiltStories,
  unbuiltWallet,
} from "./stubs";

const subs = () => ({
  wallet: unbuiltWallet(true),
  business: unbuiltBusiness(),
  shop: unbuiltShop(true),
  orders: unbuiltOrders(true),
  rides: unbuiltRides(true),
  stories: unbuiltStories(true),
  messages: unbuiltMessages(true),
  channels: unbuiltChannels(true),
});

describe("resolveFeatures", () => {
  it("maps every feature to its sub-repository", () => {
    const repos = subs();
    const byFeature = featureRepositories(repos);
    expect(byFeature.wallet).toBe(repos.wallet);
    expect(byFeature.channels).toBe(repos.channels);
    expect(Object.keys(byFeature)).toHaveLength(7);
  });

  it("is on only when built, configured and not disabled", () => {
    const repos = subs();
    repos.wallet = { ...repos.wallet, implemented: true };
    repos.rides = { ...repos.rides, implemented: true, configured: false };
    repos.stories = { ...repos.stories, implemented: true };

    const { featureStatus, features } = resolveFeatures(
      repos,
      new Set(["stories"])
    );

    expect(featureStatus("wallet")).toBe("on");
    expect(featureStatus("rides")).toBe("unconfigured");
    expect(featureStatus("stories")).toBe("off");
    expect(featureStatus("shop")).toBe("off");
    expect(features).toEqual({
      wallet: true,
      messages: false,
      channels: false,
      shop: false,
      orders: false,
      rides: false,
      stories: false,
    });
  });

  it("turns a feature off with the features it requires", () => {
    const repos = subs();
    repos.wallet = { ...repos.wallet, implemented: true };
    repos.shop = { ...repos.shop, implemented: true };
    repos.orders = { ...repos.orders, implemented: true };
    repos.rides = { ...repos.rides, implemented: true };

    const withoutShop = resolveFeatures(repos, new Set(["shop"]));
    expect(withoutShop.featureStatus("orders")).toBe("off");
    expect(withoutShop.features).toMatchObject({
      wallet: true,
      orders: false,
      rides: true,
    });

    const withoutWallet = resolveFeatures(repos, new Set(["wallet"]));
    expect(withoutWallet.features).toMatchObject({
      shop: true,
      orders: false,
      rides: false,
    });

    repos.wallet = { ...repos.wallet, configured: false };
    expect(resolveFeatures(repos, new Set()).featureStatus("rides")).toBe(
      "unconfigured"
    );
  });
});
