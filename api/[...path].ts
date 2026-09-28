import { getRequestListener } from "@hono/node-server";
import { app } from "../server/app.js";

// Vercel's Node.js runtime calls default exports as (req, res). hono/vercel returns a
// fetch-style handler, which never answers there (requests hung until the 30s timeout),
// so adapt the Hono app to a Node request listener instead.
export default getRequestListener(app.fetch);

export const config = {
  runtime: "nodejs",
};
