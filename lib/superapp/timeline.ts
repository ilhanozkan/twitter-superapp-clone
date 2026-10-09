import { IStage } from "../../types/Superapp";

// Orders and rides have no background workers: their progress is a pure
// function of the stored schedule and the server's clock.

/** One step of a schedule; `at` is an absolute ISO time, ascending across specs. */
export interface StageSpec<S extends string> {
  status: S;
  label: string;
  at: string;
}

/**
 * The stages reached by `now`, the current status (the latest reached
 * stage, else the first) and the next change. A `stop` (e.g. a
 * cancellation) ends the schedule: stages after it never happen, it becomes
 * the status, and nothing comes next.
 */
export function deriveStages<S extends string>(
  specs: StageSpec<S>[],
  now: Date,
  stop?: { status: S; label: string; at: string } | null
): {
  status: S;
  stages: IStage<S>[];
  next: { status: S; at: string } | null;
} {
  const time = now.getTime();
  const reached = (spec: { at: string }) => Date.parse(spec.at) <= time;

  if (stop) {
    const stopTime = Date.parse(stop.at);
    const before = specs.filter((spec) => Date.parse(spec.at) <= stopTime);
    return {
      status: stop.status,
      stages: [
        ...before.map((spec) => ({ ...spec, reached: reached(spec) })),
        { ...stop, reached: true },
      ],
      next: null,
    };
  }

  const stages = specs.map((spec) => ({ ...spec, reached: reached(spec) }));
  const current = stages.filter((stage) => stage.reached).pop() ?? stages[0];
  const upcoming = stages.find((stage) => !stage.reached);

  return {
    status: current.status,
    stages,
    next: upcoming ? { status: upcoming.status, at: upcoming.at } : null,
  };
}

/** How far `now` is between two times, clamped to 0..1. */
export function legProgress(
  startIso: string,
  endIso: string,
  now: Date
): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  const time = now.getTime();
  if (end <= start) return time >= end ? 1 : 0;
  return Math.min(1, Math.max(0, (time - start) / (end - start)));
}
