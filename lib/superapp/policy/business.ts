import { IBusiness } from "../../../types/Business";

/** The business account itself, or one of its delegated managers (any case). */
export function canManageBusiness(
  viewer: string,
  business: Pick<IBusiness, "username" | "managers">
): boolean {
  const lower = viewer.toLowerCase();
  return (
    lower === business.username.toLowerCase() ||
    business.managers.map((manager) => manager.toLowerCase()).includes(lower)
  );
}
