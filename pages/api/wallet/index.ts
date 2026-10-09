import { createHandler } from "../../../lib/api/handler";
import { getCurrentUsername } from "../../../lib/auth";
import { getRepository } from "../../../lib/db";
import { WalletResponse } from "../../../types/Api";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler(
  {
    // The current user's wallet and limits. Pending credits become available
    // as time passes, so the response carries the server's clock.
    async GET(req, res) {
      const viewer = getCurrentUsername();
      const { wallet } = getRepository();
      const [balance, limits] = await Promise.all([
        wallet.getWallet(viewer),
        wallet.getLimits(viewer),
      ]);

      const body: WalletResponse = {
        wallet: balance,
        limits,
        serverNow: new Date().toISOString(),
      };
      res.setHeader("Cache-Control", "private, no-store");
      res.status(200).json(body);
    },
  },
  { feature: "wallet" }
);
