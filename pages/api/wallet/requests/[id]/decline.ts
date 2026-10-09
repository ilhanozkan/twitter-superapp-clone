import { createCloseRequestHandler } from "../../../../../lib/api/wallet";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

// POST /api/wallet/requests/:id/decline — the payer says no (idempotent).
export default createCloseRequestHandler("decline");
