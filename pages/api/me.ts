import { createHandler } from "../../lib/api/handler";
import { getCurrentProfile, isReadOnly } from "../../lib/auth";
import { getRepository } from "../../lib/db";
import { MeResponse } from "../../types/Api";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler({
  async GET(req, res) {
    res.setHeader("Cache-Control", "private, no-store");
    const repo = getRepository();
    const user = await getCurrentProfile();
    const body: MeResponse = {
      user,
      readOnly: isReadOnly(),
      features: repo.features,
      managedBusinesses: await repo.business.listManagedBusinesses(
        user.username
      ),
    };
    res.status(200).json(body);
  },
});
