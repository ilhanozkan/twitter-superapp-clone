import { createHandler } from "../../lib/api/handler";
import { PLACES } from "../../lib/superapp/places";
import { PlacesResponse } from "../../types/Api";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

export default createHandler({
  // The fixed list of places for deliveries and rides. It only changes with
  // a deploy, so anyone may cache it for an hour.
  GET(req, res) {
    const body: PlacesResponse = { items: [...PLACES] };
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).json(body);
  },
});
