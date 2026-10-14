import Head from "next/head";

import PageHeader from "../../components/layout/PageHeader";
import RideView from "../../components/rides/RideView";
import { KEY_PATTERN } from "../../lib/db/sanity/ids";
import { withPageState } from "../../lib/server/pageState";
import { canViewRide } from "../../lib/superapp/policy/rides";
import { RIDE_RATES } from "../../lib/superapp/rides";
import { ridesState } from "../../slices/ridesSlice";
import { useAppSelector } from "../../store";
import { NextPageWithShell } from "../../types/PageShell";

interface RidePageProps {
  id: string;
}

/** One ride, for its rider or its driver; anyone else gets a 404. */
const RidePage: NextPageWithShell<RidePageProps> = ({ id }) => {
  const ride = useAppSelector((state) => state.rides.byId[id]);

  return (
    <>
      <Head>
        <title>{`Ride to ${ride.to.name} / Twitter SuperApp`}</title>
      </Head>
      <PageHeader
        title={`Ride to ${ride.to.name}`}
        subtitle={`#${ride.code} · ${RIDE_RATES[ride.type].label}`}
        back
      />
      {/* A new ride starts with its own clock and announcements. */}
      <RideView key={id} id={id} />
    </>
  );
};

RidePage.shell = { layout: "wide", hideComposeButton: true };
export default RidePage;

export const getServerSideProps = withPageState<RidePageProps>(
  async ({ ctx, repo, viewer }) => {
    const id = ctx.params?.id;
    if (typeof id !== "string" || !KEY_PATTERN.test(id)) {
      return { notFound: true };
    }
    const ride = await repo.rides.getRide(id);
    if (!ride || !canViewRide(viewer.username, ride)) return { notFound: true };
    return {
      props: { id },
      state: { rides: ridesState(ride, new Date().toISOString()) },
    };
  },
  { feature: "rides" }
);
