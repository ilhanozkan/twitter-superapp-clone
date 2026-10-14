import Link from "next/link";
import { RiCarLine } from "react-icons/ri";

import { useAppSelector } from "../../store";
import { PlaceId } from "../../types/Superapp";

/**
 * Slot (§12.3): "Ride here" next to a business's address, opening the
 * booking form with the business's place as the destination. Hidden while
 * Rides is off.
 */
export default function RideHereLink({ placeId }: { placeId: PlaceId }) {
  const rides = useAppSelector((state) => state.session.features.rides);
  if (!rides) return null;
  return (
    <Link
      href={`/rides?to=${encodeURIComponent(placeId)}`}
      className="flex min-h-6 items-center gap-1 self-start font-bold text-primary hover:underline"
    >
      <RiCarLine aria-hidden="true" className="text-lg" />
      Ride here
    </Link>
  );
}
