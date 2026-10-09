import { describe, expect, it } from "vitest";

import { deriveStages, legProgress, StageSpec } from "./timeline";

type Status = "placed" | "accepted" | "on_the_way" | "delivered" | "cancelled";

const at = (minutes: number) =>
  new Date(Date.UTC(2026, 9, 8, 12, minutes)).toISOString();

const specs: StageSpec<Status>[] = [
  { status: "placed", label: "Placed", at: at(0) },
  { status: "accepted", label: "Accepted", at: at(1) },
  { status: "on_the_way", label: "On the way", at: at(5) },
  { status: "delivered", label: "Delivered", at: at(10) },
];

describe("deriveStages", () => {
  it("reaches stages whose time has come, including exactly now", () => {
    const result = deriveStages(specs, new Date(at(5)));

    expect(result.status).toBe("on_the_way");
    expect(result.stages.map((stage) => stage.reached)).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(result.next).toEqual({ status: "delivered", at: at(10) });
  });

  it("starts at the first stage and ends with nothing next", () => {
    const before = deriveStages(specs, new Date(Date.parse(at(0)) - 1000));
    expect(before.status).toBe("placed");
    expect(before.stages.every((stage) => !stage.reached)).toBe(true);
    expect(before.next).toEqual({ status: "placed", at: at(0) });

    const after = deriveStages(specs, new Date(at(30)));
    expect(after.status).toBe("delivered");
    expect(after.next).toBeNull();
  });

  it("keeps labels and times", () => {
    const { stages } = deriveStages(specs, new Date(at(2)));
    expect(stages[1]).toEqual({
      status: "accepted",
      label: "Accepted",
      at: at(1),
      reached: true,
    });
  });

  it("lets a stop override the rest of the schedule", () => {
    const result = deriveStages(specs, new Date(at(8)), {
      status: "cancelled",
      label: "Cancelled",
      at: at(3),
    });

    expect(result.status).toBe("cancelled");
    expect(result.next).toBeNull();
    expect(result.stages.map((stage) => [stage.status, stage.reached])).toEqual(
      [
        ["placed", true],
        ["accepted", true],
        ["cancelled", true],
      ]
    );
  });

  it("ignores a null stop", () => {
    expect(deriveStages(specs, new Date(at(2)), null).status).toBe("accepted");
  });
});

describe("legProgress", () => {
  it("is the fraction of the leg that has passed, clamped to 0..1", () => {
    expect(legProgress(at(0), at(10), new Date(at(5)))).toBe(0.5);
    expect(legProgress(at(0), at(10), new Date(at(-5)))).toBe(0);
    expect(legProgress(at(0), at(10), new Date(at(15)))).toBe(1);
  });

  it("jumps from 0 to 1 on an empty leg", () => {
    expect(legProgress(at(5), at(5), new Date(at(4)))).toBe(0);
    expect(legProgress(at(5), at(5), new Date(at(5)))).toBe(1);
  });
});
