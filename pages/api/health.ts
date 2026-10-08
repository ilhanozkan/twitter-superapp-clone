import { createHandler } from "../../lib/api/handler";
import { getRepository } from "../../lib/db";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

// Liveness probe: reports which data source is configured, without calling it.
export default createHandler({
  GET(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ status: "ok", dataSource: getRepository().source });
  },
});
