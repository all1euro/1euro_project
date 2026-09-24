import { isConfigured, redis, KEYS, clientFingerprint, sendJson, notConfigured } from "../lib/store.js";

// POST /api/visit → numără un vizitator unic (o dată pe zi pentru fiecare conexiune)
export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  if (!isConfigured()) return notConfigured(res);

  try {
    const isNew = await redis("SET", `visit:${clientFingerprint(req)}`, "1", "EX", 86400, "NX");
    if (isNew === "OK") await redis("HINCRBY", KEYS.stats, "visitors", 1);
    sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error("visit", e);
    sendJson(res, 500, { error: "server_error" });
  }
}
