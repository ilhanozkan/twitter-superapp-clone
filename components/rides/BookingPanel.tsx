import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useId, useRef, useState } from "react";
import { HiArrowsUpDown, HiOutlineWallet } from "react-icons/hi2";

import { ApiRequestError, errorMessage } from "../../lib/client/api";
import { useIdempotencyKey } from "../../lib/client/useIdempotencyKey";
import { formatCredits } from "../../lib/superapp/money";
import { getPlace } from "../../lib/superapp/places";
import { bookRide } from "../../slices/ridesSlice";
import { useAppDispatch, useAppSelector } from "../../store";
import { RideQuoteResponse, RideType } from "../../types/Ride";
import { PlaceId } from "../../types/Superapp";
import { Button } from "../common/Button";
import DemoBadge from "../superapp/DemoBadge";
import Money from "../superapp/Money";
import PlaceSelect from "../superapp/PlaceSelect";
import RideOptions from "./RideOptions";
import { RideRouteChoice } from "./useRideQuote";

interface BookingPanelProps {
  route: RideRouteChoice;
  onRouteChange: (route: RideRouteChoice) => void;
  quote: RideQuoteResponse;
  /** Asks the server for fares and free drivers again (after a stale quote). */
  onRefreshQuote: () => Promise<void>;
  /** Where the viewer rode lately, newest first, for quick chips. */
  recentDestinations: PlaceId[];
}

// Errors after which the quote on screen is stale.
const STALE_QUOTE = new Set(["price_changed", "unavailable"]);

/**
 * Where to, which ride, and the payment. The panel is the booking's review
 * (route, type, fare, available credits and what is left after), and the
 * Book button repeats the type and the fare. The fare is sent as
 * `expectedFare` with one Idempotency-Key per choice, so a retry can't book
 * twice and a changed price is never charged silently.
 */
export default function BookingPanel({
  route,
  onRouteChange,
  quote,
  onRefreshQuote,
  recentDestinations,
}: BookingPanelProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const wallet = useAppSelector((state) => state.wallet.wallet);
  const liveRide = useAppSelector((state) =>
    state.activity.live.find((item) => item.kind === "ride")
  );
  const [type, setType] = useState<RideType>(
    () =>
      quote.quotes.find((option) => option.available)?.type ??
      quote.quotes[0].type
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(
    null
  );
  // Two clicks in one frame both see busy=false: guard synchronously too.
  const inFlight = useRef(false);
  const headingId = useId();
  const chipsId = useId();
  const reasonId = useId();

  const selected =
    quote.quotes.find((option) => option.type === type) ?? quote.quotes[0];
  const { key, rotate } = useIdempotencyKey([
    route.from,
    route.to,
    selected.type,
    selected.fare,
  ]);
  const available = wallet?.available ?? null;
  const short = available !== null && selected.fare > available;

  const reason = readOnly
    ? "Booking is turned off on this read-only demo."
    : wallet?.frozen
      ? "Your wallet is frozen, so you can’t book rides right now."
      : !selected.available
        ? `No ${selected.label} drivers are nearby right now. Choose another ride.`
        : short
          ? `You have ${formatCredits(available)} available. Add credits to book this ride.`
          : null;
  const blocked = reason !== null;

  const change = (next: RideRouteChoice) => {
    setError(null);
    onRouteChange(next);
  };
  const choose = (next: RideType) => {
    setError(null);
    setType(next);
  };

  const book = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || blocked) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const ride = await dispatch(
        bookRide(
          {
            from: route.from,
            to: route.to,
            type: selected.type,
            expectedFare: selected.fare,
          },
          key
        )
      );
      rotate();
      // Stays busy until the ride's page replaces this one.
      await router.push(`/rides/${encodeURIComponent(ride.id)}`);
    } catch (failure) {
      const code = failure instanceof ApiRequestError ? failure.code : "";
      setError({ message: errorMessage(failure), code });
      setBusy(false);
      if (STALE_QUOTE.has(code)) {
        onRefreshQuote().catch(() => {});
      }
    } finally {
      inFlight.current = false;
    }
  };

  const chips = recentDestinations.filter((place) => place !== route.from);

  return (
    <form onSubmit={book} aria-labelledby={headingId} className="flex flex-col">
      <div className="flex flex-col gap-5 px-4 py-4">
        <h2 id={headingId} className="text-xl font-extrabold">
          Where to?
        </h2>

        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <PlaceSelect
              label="Pickup"
              value={route.from}
              exclude={[route.to]}
              onChange={(from) => change({ from, to: route.to })}
            />
            <PlaceSelect
              label="Destination"
              value={route.to}
              exclude={[route.from]}
              onChange={(to) => change({ from: route.from, to })}
            />
          </div>
          <button
            type="button"
            aria-label="Swap pickup and destination"
            title="Swap pickup and destination"
            onClick={() => change({ from: route.to, to: route.from })}
            className="mt-6 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-xl transition-colors hover:bg-fg/5"
          >
            <HiArrowsUpDown aria-hidden="true" />
          </button>
        </div>

        {chips.length > 0 && (
          <div role="group" aria-labelledby={chipsId}>
            <p id={chipsId} className="text-[13px] font-bold text-muted">
              Recent destinations
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {chips.map((place) => (
                <li key={place}>
                  <button
                    type="button"
                    aria-pressed={route.to === place}
                    onClick={() => change({ from: route.from, to: place })}
                    className="min-h-9 rounded-full border border-line px-4 text-[15px] font-bold transition-colors hover:bg-fg/5 aria-pressed:border-primary-fill aria-pressed:bg-primary-fill aria-pressed:text-white aria-pressed:hover:bg-primary-fill-hover"
                  >
                    {getPlace(place).name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <RideOptions quotes={quote.quotes} value={type} onChange={choose} />
        <p className="-mt-2 text-[13px] text-muted">
          {quote.distanceKm.toFixed(1)} km · about {quote.tripMinutes} min on
          the road · demo trips run faster
        </p>

        <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-3">
          <HiOutlineWallet
            aria-hidden="true"
            className="shrink-0 text-2xl text-primary"
          />
          <div className="min-w-0 flex-1 leading-5">
            <p className="flex items-center gap-2 font-bold">
              SuperApp Wallet <DemoBadge />
            </p>
            <p className="text-[13px] text-muted">
              {available !== null ? (
                <>
                  <Money amount={available} /> available
                </>
              ) : (
                "Your balance can’t be shown right now"
              )}
            </p>
          </div>
          {available !== null && !short && (
            <p className="shrink-0 text-right text-[13px] leading-5 text-muted">
              After this ride
              <br />
              <Money amount={available - selected.fare} />
            </p>
          )}
        </div>
        <p className="-mt-2 text-[13px] text-muted">
          You pay upfront. The fare is held for your driver until pickup, and
          cancelling before then refunds it in full.
        </p>
      </div>

      <div className="sticky bottom-[calc(53px+env(safe-area-inset-bottom))] z-10 flex flex-col gap-2 border-t border-line bg-surface px-4 py-3 xs:bottom-0">
        {reason && (
          <p id={reasonId} className="text-[15px] text-muted">
            {reason}
            {short && !readOnly && (
              <>
                {" "}
                <Link
                  href="/wallet"
                  className="font-bold text-primary underline underline-offset-2"
                >
                  Add credits
                </Link>
              </>
            )}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-md border border-danger px-3 py-2 text-[15px] text-danger"
          >
            {error.message}{" "}
            {error.code === "invalid_state" && liveRide && (
              <Link
                href={liveRide.href}
                className="font-bold underline underline-offset-2"
              >
                Track your ride
              </Link>
            )}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          aria-disabled={blocked || busy}
          aria-busy={busy}
          aria-describedby={reason ? reasonId : undefined}
          className="w-full gap-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
        >
          {busy && (
            <span
              aria-hidden="true"
              className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
          )}
          Book {selected.label} · {formatCredits(selected.fare)}
        </Button>
      </div>
    </form>
  );
}
