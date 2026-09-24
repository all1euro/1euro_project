import crypto from "node:crypto";
import { isConfigured, redis, KEYS, clientFingerprint, sendJson, notConfigured } from "../lib/store.js";

const LIMITS = { name: 60, country: 60, message: 1000 };
const MAX_PENDING = 500;

function clean(value, max) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

// POST /api/submit → { type: "testimonial" | "idea", name, country, message, consent }
// Mesajele intră în lista de așteptare și apar pe site doar după aprobare în /admin.html.
export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  if (!isConfigured()) return notConfigured(res);

  const body = typeof req.body === "object" && req.body ? req.body : {};

  // câmp capcană: dacă e completat, e un robot; răspundem „ok” fără să salvăm
  if (body.website) return sendJson(res, 200, { ok: true });

  const type = body.type === "idea" ? "idea" : body.type === "testimonial" ? "testimonial" : null;
  const message = clean(body.message, LIMITS.message);
  if (!type || message.length < 10) return sendJson(res, 400, { error: "invalid" });
  if (type === "testimonial" && body.consent !== true) return sendJson(res, 400, { error: "consent_required" });

  try {
    const allowed = await redis("SET", `rl:${clientFingerprint(req)}`, "1", "EX", 60, "NX");
    if (allowed !== "OK") return sendJson(res, 429, { error: "rate_limited" });

    const entry = {
      id: crypto.randomUUID(),
      type,
      name: clean(body.name, LIMITS.name),
      country: clean(body.country, LIMITS.country),
      message,
      lang: clean(body.lang, 5),
      ts: Date.now()
    };
    await redis("LPUSH", KEYS.pending, JSON.stringify(entry));
    await redis("LTRIM", KEYS.pending, 0, MAX_PENDING - 1);

    sendJson(res, 200, { ok: true });
  } catch (e) {
    console.error("submit", e);
    sendJson(res, 500, { error: "server_error" });
  }
}
