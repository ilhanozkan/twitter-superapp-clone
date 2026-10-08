import { notFound } from "../../../lib/api/errors";
import { createHandler } from "../../../lib/api/handler";
import { routeUsername } from "../../../lib/api/validation";
import { getRepository } from "../../../lib/db";

export default createHandler({
  async GET(req, res) {
    const user = await getRepository().getUser(routeUsername(req));
    if (!user) throw notFound("User not found");

    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({ user });
  },
});
