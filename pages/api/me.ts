import { createHandler } from "../../lib/api/handler";
import { getCurrentProfile, isReadOnly } from "../../lib/auth";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler({
  async GET(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    res
      .status(200)
      .json({ user: await getCurrentProfile(), readOnly: isReadOnly() });
  },
});
