import { describe, expect, it } from "vitest";

import { NO_FEATURES } from "../../lib/superapp/features";
import { INotification } from "../../types/Notification";
import { viewNotification } from "../notifications/registry";
import { rideNotificationRenderers } from "./notificationRenderers";

const context = { viewer: "illlhanozkan", features: NO_FEATURES };

const ride = (event: "completed" | "cancelled"): INotification => ({
  id: `ride-${event}-ride-abc`,
  type: "ride",
  event,
  createdAt: "2026-10-07T14:53:00.000Z",
  actor: { username: "ahmet_drives", fullname: "Ahmet Kaya", image: null },
  rideId: "ride-abc",
  destination: "Atakule",
});

describe("ride notifications", () => {
  it("says the ride is complete and leads to it", () => {
    const view = viewNotification(ride("completed"), context);
    expect(view.text).toBe("Your ride to Atakule is complete");
    expect(view.href).toBe("/rides/ride-abc");
    expect(view.body).toBe("Driver: Ahmet Kaya");
    expect(view.tone).toBe("text-success");
  });

  it("words a cancellation too", () => {
    const view = viewNotification(ride("cancelled"), context, {
      ...rideNotificationRenderers,
    });
    expect(view.text).toBe("Your ride to Atakule was cancelled");
    expect(view.href).toBe("/rides/ride-abc");
  });
});
