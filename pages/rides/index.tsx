import Head from "next/head";
import { useMemo, useState } from "react";

import PageHeader from "../../components/layout/PageHeader";
import BookingPanel from "../../components/rides/BookingPanel";
import RideList from "../../components/rides/RideList";
import SchematicMap from "../../components/rides/SchematicMap";
import {
  RideRouteChoice,
  useRideQuote,
} from "../../components/rides/useRideQuote";
import { vehicleName } from "../../components/rides/rideText";
import FrozenNotice from "../../components/superapp/FrozenNotice";
import Notice from "../../components/superapp/Notice";
import ReadOnlyNotice from "../../components/superapp/ReadOnlyNotice";
import { withPageState } from "../../lib/server/pageState";
import { getPlace } from "../../lib/superapp/places";
import { bookingRoute, RIDE_RATES } from "../../lib/superapp/rides";
import { useAppSelector } from "../../store";
import { NextPageWithShell } from "../../types/PageShell";
import { IDriver, RidePageResponse, RideQuoteResponse } from "../../types/Ride";
import { PlaceId } from "../../types/Superapp";

const PAGE_SIZE = 10;
const RECENT_DESTINATIONS = 3;

type RidesPageProps =
  | {
      mode: "rider";
      route: RideRouteChoice;
      quote: RideQuoteResponse;
      recent: RidePageResponse;
    }
  | { mode: "driver"; driver: IDriver; trips: RidePageResponse };

const SIMULATED =
  "Rides are simulated: drivers, cars and times are not real, and demo trips are shorter than real ones.";

/** Booking: the map beside (or, on phones, above) the panel, then recent rides. */
function Booking({
  route: initialRoute,
  quote: initialQuote,
  recent,
}: Extract<RidesPageProps, { mode: "rider" }>) {
  const readOnly = useAppSelector((state) => state.session.readOnly);
  const frozen = useAppSelector((state) => !!state.wallet.wallet?.frozen);
  const [route, setRoute] = useState(initialRoute);
  const [initial] = useState(() => ({
    route: initialRoute,
    quote: initialQuote,
  }));
  const quote = useRideQuote(route, initial);
  const destinations = useMemo(
    () =>
      [...new Set(recent.items.map((ride) => ride.to.id))].slice(
        0,
        RECENT_DESTINATIONS
      ) as PlaceId[],
    [recent]
  );

  return (
    <>
      {readOnly && (
        <ReadOnlyNotice>
          Booking is turned off on this read-only demo.
        </ReadOnlyNotice>
      )}
      {frozen && <FrozenNotice />}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="border-b border-line lg:sticky lg:top-[var(--sticky-header,53px)] lg:border-b-0 lg:border-r">
          <SchematicMap
            from={getPlace(route.from)}
            to={getPlace(route.to)}
            distanceKm={quote.distanceKm}
          />
        </div>
        <div className="min-w-0">
          <BookingPanel
            route={route}
            onRouteChange={setRoute}
            quote={quote}
            onRefreshQuote={quote.refresh}
            recentDestinations={destinations}
          />
        </div>
      </div>
      <RideList
        title="Recent rides"
        initial={recent}
        role="rider"
        empty="No rides yet. Your trips will show up here."
      />
      <p className="border-t border-line px-4 py-4 text-[13px] text-muted">
        {SIMULATED}
      </p>
    </>
  );
}

/** A driver account sees the trips riders booked with them, read-only. */
function DriverTrips({
  driver,
  trips,
}: Extract<RidesPageProps, { mode: "driver" }>) {
  return (
    <>
      <Notice tone="info">
        You’re signed in as a driver ({vehicleName(driver)},{" "}
        {RIDE_RATES[driver.rideType].label}). Riders book you from this page;
        your trips are listed here, read-only.
      </Notice>
      <RideList
        title="Your trips"
        initial={trips}
        role="driver"
        empty="No trips yet. Rides booked with you will show up here."
      />
      <p className="border-t border-line px-4 py-4 text-[13px] text-muted">
        {SIMULATED}
      </p>
    </>
  );
}

const Rides: NextPageWithShell<RidesPageProps> = (props) => (
  <>
    <Head>
      <title>Rides / Twitter SuperApp</title>
    </Head>
    <PageHeader title="Rides" subtitle="Across Ankara · demo" />
    {props.mode === "driver" ? (
      <DriverTrips {...props} />
    ) : (
      // A link to other places (?from=&to=) starts the form afresh.
      <Booking key={`${props.route.from}-${props.route.to}`} {...props} />
    )}
  </>
);

Rides.shell = { layout: "wide", hideComposeButton: true };
export default Rides;

export const getServerSideProps = withPageState<RidesPageProps>(
  async ({ ctx, repo, viewer }) => {
    const driver = await repo.rides.getDriver(viewer.username);
    if (driver) {
      const trips = await repo.rides.listRides({
        driver: viewer.username,
        limit: PAGE_SIZE,
      });
      return {
        props: {
          mode: "driver",
          driver,
          trips: { ...trips, serverNow: new Date().toISOString() },
        },
      };
    }

    const route = bookingRoute(ctx.query);
    const [quote, recent] = await Promise.all([
      repo.rides.quote(route.from, route.to),
      repo.rides.listRides({ rider: viewer.username, limit: PAGE_SIZE }),
    ]);
    return {
      props: {
        mode: "rider",
        route,
        quote,
        recent: { ...recent, serverNow: new Date().toISOString() },
      },
    };
  },
  { feature: "rides" }
);
