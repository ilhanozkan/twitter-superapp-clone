import { LIMITS } from "../superapp/limits";
import { BusinessRepository } from "./business/types";
import { NotFoundError, NotImplementedError } from "./errors";
import { ChannelsRepository, MessagesRepository } from "./messages/types";
import { OrdersRepository } from "./orders/types";
import { RidesRepository } from "./rides/types";
import { ShopRepository } from "./shop/types";
import { StoriesRepository } from "./stories/types";
import { FeatureRepository } from "./types";
import { WalletRepository } from "./wallet/types";

// Sub-repositories of features whose lane has not shipped. They report
// `implemented: false` (so the feature is "off" and its UI and routes stay
// hidden), read as empty, and refuse every write with NotImplementedError.
// Each lane replaces its stub files in lib/db/{memory,sanity}/ wholesale.

const refuse = async (): Promise<never> => {
  throw new NotImplementedError();
};

const emptyPage = async () => ({ items: [], nextCursor: null });

function unbuilt(configured: boolean): FeatureRepository {
  return {
    implemented: false,
    configured,
    notifications: async () => [],
    liveActivity: async () => [],
  };
}

export function unbuiltWallet(configured: boolean): WalletRepository {
  return {
    ...unbuilt(configured),
    getWallet: async (username) => ({
      username,
      balance: 0,
      pending: 0,
      available: 0,
      frozen: false,
    }),
    getLimits: async () => ({
      minPayment: LIMITS.payment.min,
      maxPayment: LIMITS.payment.max,
      minTip: LIMITS.tip.min,
      maxTip: LIMITS.tip.max,
      tipPresets: [...LIMITS.tip.presets],
      topUpAmounts: [...LIMITS.topUp.amounts],
      topUpCap: LIMITS.topUp.cap,
      topUpsPerDay: LIMITS.topUp.perDay,
      topUpsLeftToday: 0,
      pendingRequestsLeft: 0,
    }),
    listActivity: emptyPage,
    getTransfer: async () => null,
    send: refuse,
    topUp: refuse,
    createRequest: refuse,
    getRequest: async () => null,
    listRequests: async () => [],
    payRequest: refuse,
    closeRequest: refuse,
    tipStats: async () => new Map(),
    audit: async () => ({
      ok: true,
      wallets: 0,
      transfers: 0,
      issued: 0,
      totalBalance: 0,
      mismatches: [],
      negative: [],
      pendingOverBalance: [],
      badReversals: [],
    }),
  };
}

export function unbuiltBusiness(): BusinessRepository {
  return {
    getBusiness: async () => null,
    listBusinesses: async () => [],
    listManagedBusinesses: async () => [],
    setAcceptingOrders: refuse,
  };
}

export function unbuiltShop(configured: boolean): ShopRepository {
  return {
    ...unbuilt(configured),
    getProductCards: async () => new Map(),
    getProduct: async () => null,
    getProducts: async () => [],
    listBusinessSummaries: async () => [],
    getMenu: async () => [],
    listAttachableProducts: async () => [],
    setProductAvailability: refuse,
  };
}

export function unbuiltOrders(configured: boolean): OrdersRepository {
  return {
    ...unbuilt(configured),
    placeOrder: refuse,
    placeDemoOrder: refuse,
    getOrder: async () => null,
    listOrders: emptyPage,
    cancelOrder: refuse,
    businessSummary: async () => ({
      orders: 0,
      revenue: 0,
      pending: 0,
      fromTweets: 0,
    }),
  };
}

export function unbuiltRides(configured: boolean): RidesRepository {
  return {
    ...unbuilt(configured),
    quote: async () => ({ quotes: [], distanceKm: 0, tripMinutes: 0 }),
    bookRide: refuse,
    getRide: async () => null,
    listRides: emptyPage,
    cancelRide: refuse,
    getDriver: async () => null,
  };
}

export function unbuiltStories(configured: boolean): StoriesRepository {
  return {
    ...unbuilt(configured),
    listTray: async () => [],
    getStory: async () => null,
    listStories: async () => [],
    createStory: refuse,
    deleteStory: refuse,
    markSeen: refuse,
    listViewers: async () => [],
  };
}

export function unbuiltMessages(configured: boolean): MessagesRepository {
  return {
    ...unbuilt(configured),
    unreadConversations: async () => 0,
    listConversations: async () => [],
    getConversation: async () => null,
    findDirect: async () => null,
    openDirect: refuse,
    // Every conversation is unknown until the lane ships.
    listMessages: async () => {
      throw new NotFoundError("Conversation not found");
    },
    sendMessage: refuse,
    sendPayment: refuse,
    sendRequest: refuse,
    markRead: refuse,
  };
}

export function unbuiltChannels(configured: boolean): ChannelsRepository {
  return {
    ...unbuilt(configured),
    listChannels: async () => [],
    getChannel: async () => null,
    createChannel: refuse,
    setMembership: refuse,
    setRole: refuse,
    listMembers: async () => [],
    removeMessage: refuse,
  };
}
