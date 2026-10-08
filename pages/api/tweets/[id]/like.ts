import { createReactionHandler } from "../../../../lib/api/reactions";

// PUT /api/tweets/:id/like adds it, DELETE removes it (both idempotent).
export default createReactionHandler("like");
