import { ReactNode } from "react";

import { PlaceId } from "../../types/Superapp";

/**
 * Slot (§12.3): "Ride here", a link to /rides?to=<placeId> next to a
 * business's address. Owned by the rides lane; this stub renders nothing.
 */
const RideHereLink: (props: { placeId: PlaceId }) => ReactNode = () => null;
export default RideHereLink;
