import { beforeEach, describe, expect, it } from "vitest";

import {
  expectStoresAgree,
  Subject,
  subjects,
} from "../../test/repositorySubjects";
import { NotFoundError } from "./errors";
import { DEMO_USERNAME } from "./seed";
import { Repository } from "./types";

// Business accounts on both stores: a user record with accountType
// "business" plus a profile. Subjects start at 2026-10-08T12:00Z, which is
// 15:00 in Europe/Istanbul (UTC+3).

describe.each(subjects())("%s business", (_name, create) => {
  let subject: Subject;
  let repo: Repository;

  beforeEach(() => {
    subject = create();
    repo = subject.repo;
  });

  it("reads a business from its profile and its user record", async () => {
    expect(await repo.business.getBusiness("KizilayKahve")).toEqual({
      username: "kizilaykahve",
      fullname: "Kızılay Kahve",
      image: "/avatars/kizilaykahve.svg",
      banner: "/media/banner-kizilaykahve.svg",
      category: "cafe",
      description:
        "Turkish coffee, pistachio lattes and fresh simit in the heart of Kızılay.",
      placeId: "kizilay",
      address: "Kızılay Square, Çankaya, Ankara",
      hours: { opens: "00:00", closes: "00:00", timeZone: "Europe/Istanbul" },
      acceptingOrders: true,
      prepMinutes: 3,
      deliveryMinutes: 6,
      deliveryFee: 150,
      minimumOrder: 300,
      greeting:
        "Merhaba! 👋 This is Kızılay Kahve's automatic greeting. You can order from our menu anytime.",
      managers: [],
      status: {
        open: true,
        orderable: true,
        reason: null,
        label: "Open 24 hours",
        opensAt: null,
        closesAt: null,
      },
      etaMinutes: [9, 12],
    });
    expect(await repo.business.getBusiness("superapp")).toMatchObject({
      fullname: "Twitter SuperApp",
      category: "shop",
      managers: [DEMO_USERNAME],
      etaMinutes: [180, 183],
    });
  });

  it("returns null for personal and unknown accounts", async () => {
    for (const username of [DEMO_USERNAME, "ahmet_drives", "ghost"]) {
      expect(await repo.business.getBusiness(username), username).toBeNull();
    }
  });

  it("derives opening hours from the clock in the business's time zone", async () => {
    expect((await repo.business.getBusiness("lahmacunlab"))!.status).toEqual({
      open: true,
      orderable: true,
      reason: null,
      label: "Open now · Closes 04:00",
      opensAt: null,
      closesAt: "2026-10-09T01:00:00.000Z",
    });

    subject.clock.set("2026-10-09T02:00:00.000Z"); // 05:00 in Istanbul
    expect((await repo.business.getBusiness("lahmacunlab"))!.status).toEqual({
      open: false,
      orderable: false,
      reason: "closed",
      label: "Closed · Opens 11:00",
      opensAt: "2026-10-09T08:00:00.000Z",
      closesAt: null,
    });
    expect(
      (await repo.business.getBusiness("bowlandco"))!.status
    ).toMatchObject({
      open: false,
      label: "Closed · Opens 09:00",
      opensAt: "2026-10-09T06:00:00.000Z",
    });
    expect(
      (await repo.business.getBusiness("kizilaykahve"))!.status.label
    ).toBe("Open 24 hours");
  });

  it("lists businesses by name", async () => {
    expect(
      (await repo.business.listBusinesses()).map((b) => b.username)
    ).toEqual(["bowlandco", "kizilaykahve", "lahmacunlab", "superapp"]);
  });

  it("lists the businesses a user manages: their own, then delegations, in any case", async () => {
    expect(
      await repo.business.listManagedBusinesses(DEMO_USERNAME.toUpperCase())
    ).toEqual(["superapp"]);
    expect(await repo.business.listManagedBusinesses("KizilayKahve")).toEqual([
      "kizilaykahve",
    ]);
    expect(await repo.business.listManagedBusinesses("superapp")).toEqual([
      "superapp",
    ]);
    expect(await repo.business.listManagedBusinesses("sarahcodes")).toEqual([]);
  });

  it("pauses and resumes orders", async () => {
    const paused = await repo.business.setAcceptingOrders("LahmacunLab", false);
    expect(paused).toMatchObject({
      username: "lahmacunlab",
      acceptingOrders: false,
      status: {
        open: true,
        orderable: false,
        reason: "paused",
        label: "Not taking orders right now",
      },
    });
    expect(await repo.business.getBusiness("lahmacunlab")).toEqual(paused);

    const resumed = await repo.business.setAcceptingOrders("lahmacunlab", true);
    expect(resumed.status).toMatchObject({ orderable: true, reason: null });
    expect(await repo.business.getBusiness("lahmacunlab")).toEqual(resumed);

    for (const username of [DEMO_USERNAME, "ghost"]) {
      await expect(
        repo.business.setAcceptingOrders(username, false)
      ).rejects.toBeInstanceOf(NotFoundError);
    }
  });

  it("reads a business with a frozen wallet as not orderable", async () => {
    subject.freeze("KizilayKahve", true);
    expect((await repo.business.getBusiness("kizilaykahve"))!.status).toEqual({
      open: true,
      orderable: false,
      reason: "frozen",
      label: "Not taking orders right now",
      opensAt: null,
      closesAt: null,
    });
    subject.freeze("kizilaykahve", false);
    expect(
      (await repo.business.getBusiness("kizilaykahve"))!.status.orderable
    ).toBe(true);
  });

  it("has no businesses in the core world", async () => {
    const [, createCore] = subjects({ world: "core" }).find(
      ([name]) => name === _name
    )!;
    const core = createCore().repo;
    expect(await core.business.listBusinesses()).toEqual([]);
    expect(await core.business.getBusiness("superapp")).toBeNull();
    expect(await core.business.listManagedBusinesses(DEMO_USERNAME)).toEqual(
      []
    );
  });
});

describe("stores agree on businesses", () => {
  it("over time, paused and frozen", async () => {
    await expectStoresAgree(
      (repo: Repository) =>
        Promise.all([
          repo.business.listBusinesses(),
          repo.business.getBusiness("bowlandco"),
          repo.business.listManagedBusinesses(DEMO_USERNAME),
        ]),
      {
        prepare: async (subject) => {
          subject.clock.set("2026-10-08T18:30:00.000Z");
          subject.freeze("bowlandco", true);
          await subject.repo.business.setAcceptingOrders("superapp", false);
        },
      }
    );
  });
});
