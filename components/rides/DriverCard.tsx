import Link from "next/link";
import { HiOutlineChatBubbleLeftRight } from "react-icons/hi2";

import { firstName } from "../../lib/superapp/rides";
import { useAppSelector } from "../../store";
import { IDriver } from "../../types/Ride";
import Avatar from "../common/Avatar";
import { ButtonLink } from "../common/Button";
import { vehicleName } from "./rideText";

/**
 * Who is driving: avatar, name, the car and its plate, and "Message
 * Ahmet" while Messages is on (B1 opens the conversation from ?to=). No
 * ratings, anywhere.
 */
export default function DriverCard({ driver }: { driver: IDriver }) {
  const messages = useAppSelector((state) => state.session.features.messages);
  const name = firstName(driver.fullname);

  return (
    <section
      aria-labelledby="driver-heading"
      className="flex flex-col gap-3 border-t border-line px-4 py-4"
    >
      <h2 id="driver-heading" className="sr-only">
        Your driver
      </h2>
      <div className="flex items-center gap-3">
        <Avatar user={driver} size={48} />
        <div className="min-w-0 flex-1 leading-5">
          <Link
            href={`/${driver.username}`}
            className="block truncate font-bold hover:underline"
          >
            {driver.fullname}
          </Link>
          {/* How the rider finds the car: it wraps rather than being cut. */}
          <p className="text-[15px] text-muted [overflow-wrap:anywhere]">
            {vehicleName(driver)}
          </p>
        </div>
        <p className="shrink-0 rounded-md border-2 border-fg px-2 py-0.5 font-mono text-[15px] font-bold tabular-nums">
          <span className="sr-only">Plate </span>
          {driver.vehicle.plate}
        </p>
      </div>
      {messages && (
        <ButtonLink
          href={`/messages?to=${encodeURIComponent(driver.username)}`}
          variant="outline"
          className="min-h-11 gap-2 self-start"
        >
          <HiOutlineChatBubbleLeftRight aria-hidden="true" />
          Message {name}
        </ButtonLink>
      )}
    </section>
  );
}
