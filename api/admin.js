import crypto from "node:crypto";
import {
  isConfigured, redis, pipeline, KEYS, getStats, sendJson, notConfigured, parseList, clientFingerprint
} from "../lib/store.js";

function passwordOk(given) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected || !given) return false;
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function findIn(key, id) {
  const items = parseList(await redis("LRANGE", key, 0, -1));
  return items.find((item) => item.data.id === id) || null;
}

// POST /api/admin  (antet: x-admin-password)
// { action: "list" }
// { action: "approve" | "reject", id }        → pentru mesajele în așteptare
// { action: "unpublish", id }                  → scoate un testimonial de pe site
// { action: "addDonations", count, amount, source, note }  → pentru PayPal / Revolut
export default async function handler(req, res) {
  if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
  if (!process.env.ADMIN_PASSWORD) return sendJson(res, 503, { error: "admin_password_not_set" });
  if (!isConfigured()) return notConfigured(res);

  // maximum 10 încercări greșite pe minut, ca parola să nu poată fi ghicită
  const failKey = `adminfail:${clientFingerprint(req)}`;
  const fails = Number(await redis("GET", failKey)) || 0;
  if (fails >= 10) return sendJson(res, 429, { error: "too_many_attempts" });

  if (!passwordOk(req.headers["x-admin-password"])) {
    await pipeline([["INCR", failKey], ["EXPIRE", failKey, 60]]);
    return sendJson(res, 401, { error: "wrong_password" });
  }

  const body = typeof req.body === "object" && req.body ? req.body : {};

  try {
    switch (body.action) {
      case "list": {
        const [pending, approved, ideas, log] = await pipeline([
          ["LRANGE", KEYS.pending, 0, -1],
          ["LRANGE", KEYS.approved, 0, -1],
          ["LRANGE", KEYS.ideasArchive, 0, 99],
          ["LRANGE", KEYS.donationLog, 0, 49]
        ]);
        return sendJson(res, 200, {
          stats: await getStats(),
          pending: parseList(pending).map((i) => i.data),
          approved: parseList(approved).map((i) => i.data),
          ideas: parseList(ideas).map((i) => i.data),
          donations: parseList(log).map((i) => i.data)
        });
      }

      case "approve": {
        const item = await findIn(KEYS.pending, body.id);
        if (!item) return sendJson(res, 404, { error: "not_found" });
        const target = item.data.type === "testimonial" ? KEYS.approved : KEYS.ideasArchive;
        await pipeline([
          ["LREM", KEYS.pending, 1, item.raw],
          ["LPUSH", target, item.raw]
        ]);
        return sendJson(res, 200, { ok: true });
      }

      case "reject": {
        const item = await findIn(KEYS.pending, body.id);
        if (!item) return sendJson(res, 404, { error: "not_found" });
        await redis("LREM", KEYS.pending, 1, item.raw);
        return sendJson(res, 200, { ok: true });
      }

      case "unpublish": {
        const item = await findIn(KEYS.approved, body.id);
        if (!item) return sendJson(res, 404, { error: "not_found" });
        await redis("LREM", KEYS.approved, 1, item.raw);
        return sendJson(res, 200, { ok: true });
      }

      case "addDonations": {
        // count și amount pot fi și negative, pentru corecturi
        const count = Math.trunc(Number(body.count));
        const cents = Math.round(Number(body.amount) * 100);
        if (!Number.isFinite(count) || !Number.isFinite(cents) || (count === 0 && cents === 0)) {
          return sendJson(res, 400, { error: "invalid" });
        }
        const entry = {
          id: crypto.randomUUID(),
          source: String(body.source || "manual").slice(0, 30),
          note: String(body.note || "").slice(0, 200),
          count,
          cents,
          ts: Date.now()
        };
        await pipeline([
          ["HINCRBY", KEYS.stats, "donations", count],
          ["HINCRBY", KEYS.stats, "cents", cents],
          ["LPUSH", KEYS.donationLog, JSON.stringify(entry)],
          ["LTRIM", KEYS.donationLog, 0, 999]
        ]);
        return sendJson(res, 200, { ok: true, stats: await getStats() });
      }

      default:
        return sendJson(res, 400, { error: "unknown_action" });
    }
  } catch (e) {
    console.error("admin", e);
    sendJson(res, 500, { error: "server_error" });
  }
}
