// netlify/functions/ots_submit.js
// Write-only anchor creation with idempotency and optional HMAC guard.

const crypto = require("crypto");

const HMAC_SECRET = process.env.OTS_INTERNAL_HMAC || ""; // optional: can be empty

async function getFunctionStore(event) {
  const mod = await import("@netlify/blobs");
  if (typeof mod.connectLambda === "function") await mod.connectLambda(event);
  const getStore = mod.getStore || mod.default?.getStore;
  if (!getStore) throw new Error("getStore not available in @netlify/blobs");
  const store = getStore({ name: "default" });
  if (!store?.get || !store?.set) throw new Error("Function store unavailable");
  return store;
}

function validSignature(id, hash, sig) {
  if (!HMAC_SECRET) return true; // skip check if no secret configured
  const msg = `${id}.${hash}`;
  const h = crypto.createHmac("sha256", HMAC_SECRET).update(msg).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(sig || "", "hex"));
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const qs = new URLSearchParams(event.queryStringParameters);
    const id = (qs.get("id") || "").trim();
    const passedHash = (qs.get("hash") || "").trim();
    const sig = (qs.get("sig") || "").trim();

    if (!id) return { statusCode: 400, body: "Missing ?id=" };

    const hash =
      passedHash || crypto.createHash("sha256").update(id).digest("hex");

    if (!validSignature(id, hash, sig)) {
      return { statusCode: 403, body: "Invalid signature" };
    }

    const store = await getFunctionStore(event);

    const anchorKey = `anchor:${id}.json`;

    // idempotency: if already anchored, just return existing record
    let existing = null;
    try {
      existing = await store.get(anchorKey, { type: "json" });
    } catch {}
    if (existing && existing.state && existing.state !== "OTS_SUBMITTED") {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: true,
          anchorKey,
          state: existing.state,
          note: "Already anchored",
        }),
      };
    }

    const anchorData = {
      id,
      hash,
      state: "OTS_SUBMITTED",
      submittedAt: new Date().toISOString(),
      calendars: [
        "https://alice.btc.calendar.opentimestamps.org",
        "https://bob.btc.calendar.opentimestamps.org",
      ],
    };

    await store.set(anchorKey, JSON.stringify(anchorData), {
      contentType: "application/json",
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, anchorKey, state: anchorData.state }),
    };
  } catch (err) {
    console.error("[OTS_SUBMIT] fatal:", err?.message);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};