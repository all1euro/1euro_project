import { isConfigured, redis, KEYS, sendJson, notConfigured, parseList } from "../lib/store.js";

// GET /api/testimonials → testimonialele aprobate (cele mai noi primele)
export default async function handler(req, res) {
  if (req.method !== "GET") return sendJson(res, 405, { error: "method_not_allowed" });
  if (!isConfigured()) return notConfigured(res);

  try {
    const raw = await redis("LRANGE", KEYS.approved, 0, 23);
    const items = parseList(raw).map(({ data }) => ({
      name: data.name,
      country: data.country,
      message: data.message,
      ts: data.ts
    }));
    res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=120");
    sendJson(res, 200, { items });
  } catch (e) {
    console.error("testimonials", e);
    sendJson(res, 500, { error: "server_error" });
  }
}
