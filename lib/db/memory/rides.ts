import { RidesRepository } from "../rides/types";
import { RidesSeed } from "../seeds/rides";
import { unbuiltRides } from "../stubs";
import { MemoryDeps } from "./deps";

// Stub: the rides lane replaces this file.

export type RidesMemoryState = Record<string, never>;

export const createRidesMemoryState: (
  seed: RidesSeed | null
) => RidesMemoryState = () => ({});

export const createMemoryRides: (deps: MemoryDeps) => RidesRepository = () =>
  unbuiltRides(true);
