import { IBusinessHours, IBusinessStatus } from "../../types/Business";

// Opening hours are wall-clock times in the business's IANA zone. They are
// evaluated with Intl in that zone, so the server and every browser agree
// whatever their own time zone.

const MINUTES_PER_DAY = 24 * 60;

const toMinutes = (hhmm: string) => {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return hours * 60 + minutes;
};

/** Minutes since local midnight in `timeZone`. */
function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) =>
    Number(parts.find((candidate) => candidate.type === type)?.value ?? 0);
  return part("hour") * 60 + part("minute");
}

/** The instant `minutes` local minutes after the start of the current minute. */
function minutesFromNow(now: Date, minutes: number): string {
  const startOfMinute =
    now.getTime() - now.getUTCSeconds() * 1000 - now.getUTCMilliseconds();
  return new Date(startOfMinute + minutes * 60_000).toISOString();
}

/**
 * Whether a business is open at `now` and can take orders. A frozen wallet
 * or paused orders explain "not orderable" before the hours do, because
 * opening time would not change them.
 */
export function businessStatus(
  hours: IBusinessHours,
  acceptingOrders: boolean,
  frozen: boolean,
  now: Date
): IBusinessStatus {
  const opens = toMinutes(hours.opens);
  const closes = toMinutes(hours.closes);
  const time = localMinutes(now, hours.timeZone);
  const allDay = opens === closes;
  const open =
    allDay ||
    (opens < closes
      ? time >= opens && time < closes
      : time >= opens || time < closes);

  const until = (target: number) =>
    minutesFromNow(
      now,
      (target - time + MINUTES_PER_DAY) % MINUTES_PER_DAY || MINUTES_PER_DAY
    );

  const reason = frozen
    ? "frozen"
    : !acceptingOrders
      ? "paused"
      : !open
        ? "closed"
        : null;

  let label: string;
  if (reason === "frozen" || reason === "paused") {
    label = "Not taking orders right now";
  } else if (allDay) {
    label = "Open 24 hours";
  } else if (open) {
    label = `Open now · Closes ${hours.closes}`;
  } else {
    label = `Closed · Opens ${hours.opens}`;
  }

  return {
    open,
    orderable: reason === null,
    reason,
    label,
    opensAt: allDay || open ? null : until(opens),
    closesAt: allDay || !open ? null : until(closes),
  };
}

/** The delivery estimate shown to buyers: [prep + delivery, prep + delivery + 3] minutes. */
export function etaMinutes(
  prepMinutes: number,
  deliveryMinutes: number
): [number, number] {
  const total = prepMinutes + deliveryMinutes;
  return [total, total + 3];
}
