import { useEffect, useMemo, useRef, useState } from "react";

import { usePolling } from "../../lib/client/usePolling";
import { useServerClock } from "../../lib/client/useServerClock";
import { rideAt } from "../../lib/superapp/rides";
import { fetchRide } from "../../slices/ridesSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { IRide } from "../../types/Ride";
import { ButtonLink } from "../common/Button";
import ReadOnlyNotice from "../superapp/ReadOnlyNotice";
import CancelRide from "./CancelRide";
import DriverCard from "./DriverCard";
import RideReceipt from "./RideReceipt";
import RideStatus from "./RideStatus";
import { RideRole } from "./rideText";
import RideTip from "./RideTip";
import SchematicMap from "./SchematicMap";
import { useServerNow } from "./useServerNow";

/** How often an active ride is re-read (a cancel from another tab, say). */
export const RIDE_POLL_INTERVAL = 5_000;
// Re-read just past a stage change, so the server's clock has passed it.
const AFTER_CHANGE_MS = 500;

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** A driver was matched (a ride cancelled while finding one never had one to show). */
const driverAssigned = (ride: IRide) =>
  ride.stages.some((stage) => stage.status === "arriving" && stage.reached);

// The stages the shell's live activity announcer reads out for a ride in
// progress ("Ride to Atakule: Ahmet is on the way"), on every page, this
// one included. Until it skips an item's own page, as the banner does,
// this page leaves those stages to it, so each is said once. A finished
// or cancelled ride leaves the live activity: the page says those itself.
const SHELL_ANNOUNCES = new Set<IRide["status"]>(["arriving", "on_trip"]);

/** The car on the map for a ride at its current stage. */
function carOf(
  ride: IRide
): { leg: "pickup" | "trip"; fraction: number } | null {
  if (ride.status === "completed") return { leg: "trip", fraction: 1 };
  return ride.progress.leg
    ? { leg: ride.progress.leg, fraction: ride.progress.fraction }
    : null;
}

/**
 * A ride as its rider or driver sees it: the map with the car, the stage
 * headline and steps, the driver, the trip or receipt, and the rider's
 * actions (cancel before pickup; tip and book again afterwards). The ride
 * is re-derived every second on the server's clock, so the car moves and
 * stages change on time; polls pick up changes made elsewhere.
 */
export default function RideView({ id }: { id: string }) {
  const dispatch = useAppDispatch();
  const stored = useAppSelector((state) => state.rides.byId[id]);
  const serverNow =
    useAppSelector((state) => state.rides.serverNow) ?? stored.requestedAt;
  const viewer = useAppSelector((state) => state.session.viewer);
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const wallet = useAppSelector((state) => state.session.features.wallet);
  const live = useAppSelector((state) =>
    state.activity.live.some((item) => item.kind === "ride" && item.id === id)
  );
  // A cancel made here is said by its toast and the headline taking focus.
  const [cancelledHere, setCancelledHere] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  const role: RideRole =
    viewer && same(viewer.username, stored.driver.username)
      ? "driver"
      : "rider";
  const now = useServerNow(
    serverNow,
    stored.cancelledAt ? null : stored.dropoffAt
  );
  const ride = useMemo(() => rideAt(stored, now), [stored, now]);
  const active = ride.status !== "completed" && ride.status !== "cancelled";

  const clock = useServerClock(serverNow);
  const { failures, refreshNow } = usePolling(() => dispatch(fetchRide(id)), {
    interval: RIDE_POLL_INTERVAL,
    enabled: active,
  });
  useEffect(() => {
    if (!ride.nextChangeAt) return;
    const wait = Date.parse(ride.nextChangeAt) - clock.now().getTime();
    const timer = setTimeout(refreshNow, Math.max(0, wait) + AFTER_CHANGE_MS);
    return () => clearTimeout(timer);
  }, [ride.nextChangeAt, clock, refreshNow]);

  const rider = role === "rider";
  const bookAgain = `/rides?from=${ride.from.id}&to=${ride.to.id}`;
  const quiet = (stage: IRide["status"]) =>
    stage === "cancelled" ? cancelledHere : live && SHELL_ANNOUNCES.has(stage);

  return (
    <>
      {readOnly && rider && (
        <ReadOnlyNotice>
          Booking, cancelling and tips are turned off on this read-only demo.
        </ReadOnlyNotice>
      )}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="border-b border-line lg:sticky lg:top-[var(--sticky-header,53px)] lg:border-b-0 lg:border-r">
          <SchematicMap
            from={ride.from}
            to={ride.to}
            distanceKm={ride.distanceKm}
            car={carOf(ride)}
            approach
          />
        </div>

        <div className="min-w-0">
          <RideStatus
            ride={ride}
            now={now}
            role={role}
            headingRef={heading}
            quiet={quiet}
          />
          {failures >= 2 && (
            <p role="status" className="px-4 pb-3 text-[13px] text-muted">
              Can’t reach the server right now. Trying again…
            </p>
          )}
          {rider && !readOnly && (
            <CancelRide
              ride={ride}
              onButtonGone={() => heading.current?.focus()}
              onCancelling={setCancelledHere}
            />
          )}
          {rider && driverAssigned(ride) && <DriverCard driver={ride.driver} />}
          <RideReceipt ride={ride} role={role} />
          {rider && ride.status === "completed" && !readOnly && wallet && (
            <RideTip ride={ride} />
          )}
          {rider && !active && (
            <div className="border-t border-line px-4 py-4">
              <ButtonLink
                href={bookAgain}
                variant="outline"
                className="min-h-11"
              >
                Book again
              </ButtonLink>
            </div>
          )}
          <p className="border-t border-line px-4 py-4 text-[13px] text-muted">
            Rides are simulated: drivers, cars and times are not real, and demo
            trips are shorter than real ones.
          </p>
        </div>
      </div>
    </>
  );
}
