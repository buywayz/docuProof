// netlify/functions/admin_remove_test_badges.js
// One-time cleanup: removes docuProof Verified TEST pages created by the owner's
// own test purchases (any buywayzllc@gmail.com address, including +aliases).
// Only touches records whose email belongs to the owner — real customers are never affected.
// Safe to run more than once. Delete this file after use.

const crypto = require("crypto");
const { getStore } = require("./_db");

const OWNER_LOCAL = "buywayzllc";
const OWNER_DOMAIN = "gmail.com";

function isOwnerEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  const [local = "", domain = ""] = e.split("@");
  return domain === OWNER_DOMAIN && local.split("+")[0] === OWNER_LOCAL;
}

const hash = (e) => crypto.createHash("sha256").update(String(e).trim().toLowerCase()).digest("hex");

exports.handler = async () => {
  const store = await getStore();
  if (!store) return { statusCode: 500, body: JSON.stringify({ ok: false, error: "blobs unavailable" }) };

  const removed = [];
  const kept = [];
  const { blobs = [] } = await store.list({ prefix: "verified:" });

  for (const { key } of blobs) {
    let rec = null;
    try { rec = await store.get(key, { type: "json" }); } catch {}
    if (!rec || !isOwnerEmail(rec.email)) { kept.push(key); continue; }

    const h = hash(rec.email);
    await store.delete(key);
    await store.delete(`customer:${h}`);
    await store.delete(`badge-lock:${h}`);
    removed.push({ page: `/verified/${key.slice("verified:".length)}`, email: rec.email });
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({ ok: true, removed, otherVerifiedPagesUntouched: kept.length }, null, 2),
  };
};
