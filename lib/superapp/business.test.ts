import { describe, expect, it } from "vitest";

import { IBusinessHours } from "../../types/Business";
import { businessStatus, etaMinutes } from "./business";

const ISTANBUL = "Europe/Istanbul";
/** Istanbul is UTC+3 all year. */
const istanbul = (hhmm: string, day = 8) =>
  new Date(`2026-10-${String(day).padStart(2, "0")}T${hhmm}:00+03:00`);

const lateNight: IBusinessHours = {
  opens: "11:00",
  closes: "04:00",
  timeZone: ISTANBUL,
};
const daytime: IBusinessHours = {
  opens: "09:00",
  closes: "21:00",
  timeZone: ISTANBUL,
};
const allDay: IBusinessHours = {
  opens: "00:00",
  closes: "00:00",
  timeZone: ISTANBUL,
};

describe("businessStatus", () => {
  it("is open all day when opening and closing times are equal", () => {
    expect(businessStatus(allDay, true, false, istanbul("03:30"))).toEqual({
      open: true,
      orderable: true,
      reason: null,
      label: "Open 24 hours",
      opensAt: null,
      closesAt: null,
    });
  });

  it("handles same-day hours", () => {
    const open = businessStatus(daytime, true, false, istanbul("12:15"));
    expect(open).toMatchObject({
      open: true,
      orderable: true,
      label: "Open now · Closes 21:00",
      opensAt: null,
      closesAt: istanbul("21:00").toISOString(),
    });

    const closed = businessStatus(daytime, true, false, istanbul("21:00"));
    expect(closed).toMatchObject({
      open: false,
      orderable: false,
      reason: "closed",
      label: "Closed · Opens 09:00",
      opensAt: istanbul("09:00", 9).toISOString(),
      closesAt: null,
    });

    expect(businessStatus(daytime, true, false, istanbul("09:00")).open).toBe(
      true
    );
  });

  it("wraps hours past midnight", () => {
    expect(
      businessStatus(lateNight, true, false, istanbul("02:00"))
    ).toMatchObject({
      open: true,
      label: "Open now · Closes 04:00",
      closesAt: istanbul("04:00").toISOString(),
    });
    expect(
      businessStatus(lateNight, true, false, istanbul("23:30"))
    ).toMatchObject({
      open: true,
      closesAt: istanbul("04:00", 9).toISOString(),
    });
    expect(
      businessStatus(lateNight, true, false, istanbul("05:00"))
    ).toMatchObject({
      open: false,
      label: "Closed · Opens 11:00",
      opensAt: istanbul("11:00").toISOString(),
    });
  });

  it("evaluates hours in the business's time zone, not the server's", () => {
    // 08:30 UTC is 11:30 in Istanbul.
    const now = new Date("2026-10-08T08:30:00.000Z");
    expect(businessStatus(lateNight, true, false, now).open).toBe(true);
    expect(
      businessStatus({ ...lateNight, timeZone: "UTC" }, true, false, now).open
    ).toBe(false);
  });

  it("counts from the start of the current minute", () => {
    const now = new Date(istanbul("20:59").getTime() + 42_500);
    expect(businessStatus(daytime, true, false, now).closesAt).toBe(
      istanbul("21:00").toISOString()
    );
  });

  it("explains paused and frozen businesses before their hours", () => {
    expect(
      businessStatus(daytime, false, false, istanbul("12:00"))
    ).toMatchObject({
      open: true,
      orderable: false,
      reason: "paused",
      label: "Not taking orders right now",
    });
    expect(
      businessStatus(daytime, true, true, istanbul("12:00"))
    ).toMatchObject({
      open: true,
      orderable: false,
      reason: "frozen",
      label: "Not taking orders right now",
    });
    expect(
      businessStatus(daytime, false, true, istanbul("22:00"))
    ).toMatchObject({ open: false, reason: "frozen" });
  });
});

describe("etaMinutes", () => {
  it("is prep + delivery, plus 3 minutes of slack", () => {
    expect(etaMinutes(3, 6)).toEqual([9, 12]);
    expect(etaMinutes(60, 120)).toEqual([180, 183]);
  });
});
