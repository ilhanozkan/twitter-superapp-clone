import { createReactionHandler } from "../../../../lib/api/reactions";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

// PUT /api/tweets/:id/retweet adds it, DELETE removes it (both idempotent).
export default createReactionHandler("retweet");
