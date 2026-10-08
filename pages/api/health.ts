import { createHandler } from "../../lib/api/handler";
import { getRepository } from "../../lib/db";

// Liveness probe: reports which data source is configured, without calling it.
export default createHandler({
  GET(req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ status: "ok", dataSource: getRepository().source });
  },
});
