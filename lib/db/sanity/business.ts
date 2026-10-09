import { BusinessRepository } from "../business/types";
import { unbuiltBusiness } from "../stubs";
import { SanityDeps } from "./deps";

export const createSanityBusiness: (
  deps: SanityDeps
) => BusinessRepository = () => unbuiltBusiness();
