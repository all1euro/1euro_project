// Acces la baza de date Upstash Redis (se conectează din Vercel → Storage).
// Vercel pune automat adresa și cheia în variabilele de mediu de mai jos.
import crypto from "node:crypto";

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const KEYS = {
  stats: "stats",                          // hash: visitors, donations, cents
  pending: "submissions:pending",          // listă: testimoniale și idei noi
  approved: "testimonials:approved",       // listă: testimoniale publicate
  ideasArchive: "ideas:archived",          // listă: idei citite
  donationLog: "donations:log"             // listă: donații adăugate (manual sau Stripe)
};

export function isConfigured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

export async function redis(...command) {
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export async function pipeline(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands)
  });
  const data = await res.json();
  const failed = data.find((r) => r.error);
  if (failed) throw new Error(failed.error);
  return data.map((r) => r.result);
}

export async function getStats() {
  const [visitors, donations, cents] = await redis("HMGET", KEYS.stats, "visitors", "donations", "cents");
  return {
    visitors: Number(visitors) || 0,
    donations: Number(donations) || 0,
    cents: Number(cents) || 0
  };
}

// Adresa IP nu se salvează: se păstrează doar o amprentă (hash) care expiră.
export function clientFingerprint(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const salt = process.env.ADMIN_PASSWORD || "1euro";
  return crypto.createHash("sha256").update(salt + ip).digest("hex").slice(0, 32);
}

export function sendJson(res, status, body) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
}

export function notConfigured(res) {
  sendJson(res, 503, { error: "storage_not_configured" });
}

export function parseList(raw) {
  return (raw || []).map((item) => {
    try { return { raw: item, data: JSON.parse(item) }; } catch (e) { return null; }
  }).filter(Boolean);
}
