import { notFound } from "../../lib/api/errors";
import { createHandler } from "../../lib/api/handler";

// No request body: skip parsing so nothing is buffered.
export const config = { api: { bodyParser: false } };

// Unknown /api paths (typos, the removed /api/getTweets and /api/addTweet)
// answer with the JSON error shape instead of Next's HTML 404 page.
const unknownEndpoint = () => {
  throw notFound("Unknown API endpoint");
};

export default createHandler({
  GET: unknownEndpoint,
  POST: unknownEndpoint,
  PUT: unknownEndpoint,
  DELETE: unknownEndpoint,
});
