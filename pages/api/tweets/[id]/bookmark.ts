import { createReactionHandler } from "../../../../lib/api/reactions";

// PUT /api/tweets/:id/bookmark adds it, DELETE removes it (both idempotent).
export default createReactionHandler("bookmark");
