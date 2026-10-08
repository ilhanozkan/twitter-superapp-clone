import { createHandler } from "../../lib/api/handler";
import { getCurrentProfile } from "../../lib/auth";

export default createHandler({
  async GET(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).json({ user: await getCurrentProfile() });
  },
});
