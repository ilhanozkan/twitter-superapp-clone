import Link from "next/link";
import { ReactNode } from "react";
import { HiArrowLongRight } from "react-icons/hi2";

import { useAppSelector } from "../../store";
import { IRide } from "../../types/Ride";
import LocalTime from "../superapp/LocalTime";
import Money from "../superapp/Money";
import { RideRole, rideTypeName } from "./rideText";

const receiptPath = (id: string) =>
  `/wallet/transactions/${encodeURIComponent(id)}`;

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{term}</dt>
      <dd className="min-w-0 text-right [overflow-wrap:anywhere]">
        {children}
      </dd>
    </>
  );
}

/**
 * The trip: pickup → destination, ride type, distance and the fare, with
 * links to the wallet's receipts (the payment, and the refund of a
 * cancelled ride). Once the ride is complete it is the receipt, with the
 * pickup and arrival times.
 */
export default function RideReceipt({
  ride,
  role,
}: {
  ride: IRide;
  role: RideRole;
}) {
  const wallet = useAppSelector((state) => state.session.features.wallet);
  const completed = ride.status === "completed";
  // A receipt opens for its two parties: the rider paid, the driver was paid.
  const receipt = (id: string, label: string) =>
    wallet ? (
      <Link
        href={receiptPath(id)}
        className="font-bold text-primary hover:underline"
      >
        {label}
      </Link>
    ) : null;

  return (
    <section
      aria-labelledby="trip-heading"
      className="border-t border-line px-4 py-4"
    >
      <h2 id="trip-heading" className="text-xl font-extrabold">
        {completed ? "Receipt" : "Trip"}
      </h2>
      <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[17px] font-bold">
        <span>{ride.from.name}</span>
        <HiArrowLongRight aria-hidden="true" className="text-muted" />
        <span className="sr-only">to</span>
        <span>{ride.to.name}</span>
      </p>
      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[15px]">
        <Row term="Ride">{rideTypeName(ride)}</Row>
        <Row term="Distance">{ride.distanceKm.toFixed(1)} km</Row>
        {role === "driver" && <Row term="Rider">{ride.rider.fullname}</Row>}
        {completed && (
          <>
            <Row term="Picked up">
              <LocalTime iso={ride.pickupAt} />
            </Row>
            <Row term="Arrived">
              <LocalTime iso={ride.dropoffAt} />
            </Row>
          </>
        )}
        <Row term={role === "rider" ? "Fare paid" : "Fare"}>
          <Money amount={ride.fare} className="font-bold" />
        </Row>
        {ride.refundTransferId && (
          <Row term="Refunded">
            <Money amount={ride.fare} />
          </Row>
        )}
        <Row term="Ride code">
          <span className="font-mono">#{ride.code}</span>
        </Row>
      </dl>
      {wallet && (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
          {receipt(ride.paymentTransferId, "Payment receipt")}
          {ride.refundTransferId &&
            receipt(ride.refundTransferId, "Refund receipt")}
        </p>
      )}
    </section>
  );
}
