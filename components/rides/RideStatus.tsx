import { Ref, useState } from "react";

import { IRide } from "../../types/Ride";
import LocalTime from "../superapp/LocalTime";
import StageList from "../superapp/StageList";
import { rideAnnouncement, rideHeadline, RideRole } from "./rideText";

interface RideStatusProps {
  /** The ride derived at `now`. */
  ride: IRide;
  now: Date;
  role: RideRole;
  /** The headline takes focus after a change that removes the control the user was on. */
  headingRef?: Ref<HTMLHeadingElement>;
  /**
   * Stages something else on the page already says: the headline still
   * changes, but the region stays quiet (and drops what it said before).
   */
  quiet?: (stage: IRide["status"]) => boolean;
}

/**
 * Where the ride is: a headline ("Ahmet is 3 min away"), the stages with
 * their times, and a polite live region that announces each new stage
 * once. Countdowns and polls never announce anything.
 */
export default function RideStatus({
  ride,
  now,
  role,
  headingRef,
  quiet,
}: RideStatusProps) {
  const headline = rideHeadline(ride, now, role);
  // The stage this page has shown: a different one is announced, once.
  const [shown, setShown] = useState(ride.status);
  const [announcement, setAnnouncement] = useState("");
  if (shown !== ride.status) {
    setShown(ride.status);
    setAnnouncement(quiet?.(ride.status) ? "" : rideAnnouncement(ride, role));
  }

  return (
    <section aria-labelledby={`ride-status-${ride.id}`} className="px-4 py-4">
      <h2
        id={`ride-status-${ride.id}`}
        ref={headingRef}
        tabIndex={-1}
        className="text-2xl font-extrabold leading-8 [overflow-wrap:anywhere] focus:outline-none"
      >
        {headline.text}
        {headline.arrivesAt && (
          <>
            {" · arrives "}
            <LocalTime iso={headline.arrivesAt} />
          </>
        )}
      </h2>
      <div className="mt-4">
        <StageList stages={ride.stages} />
      </div>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
