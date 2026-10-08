import { createReactionHandler } from "../../../../lib/api/reactions";

// PUT /api/tweets/:id/retweet adds it, DELETE removes it (both idempotent).
export default createReactionHandler("retweet");
