import { isConfigured, getStats, sendJson, notConfigured } from "../lib/store.js";

// GET /api/stats → { visitors, donations, cents }
export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
  if (!isConfigured()) return notConfigured(res);

  try {
    const stats = await getStats();
    res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=60");
    sendJson(res, 200, stats);
  } catch (e) {
    console.error("stats", e);
    sendJson(res, 500, { error: "server_error" });
  }
}
