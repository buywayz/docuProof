// netlify/functions/ots_submit.js
// Submit a hash to the OTS sidecar and store the .ots receipt in Netlify Blobs.
//
// Called as POST with JSON:
//   { "id": "<proof id>", "hash": "<64-hex>" }

const STAMP_PATH = "/stamp-hash"; // ⬅️ adjust if your sidecar uses a different path

// Small helper to get a Blobs store using explicit siteID + token
let storePromise = null;
async function getStoreSafe() {
  if (storePromise) return storePromise;

  storePromise = (async () => {
    const mod = await import("@netlify/blobs");

    const siteID =
      process.env.NETLIFY_SITE_ID ||
      process.env.SITE_ID ||
      process.env.SITE_NAME ||
      null;

    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.BLOBS_TOKEN ||
      null;

    if (!siteID || !token) {
      console.error("ots_submit: missing Blobs credentials", { siteID, haveToken: !!token });
      return null;
    }

    if (mod.BlobsClient) {
      const client = new mod.BlobsClient({ siteID, token });
      return client.getStore("proofs");
    }

    return mod.getStore({ name: "proofs", siteID, token });
  })();

  return storePromise;
}

/** Normalize sidecar base URL */
function sidecarBase() {
  const base =
    process.env.OTS_SIDECAR_URL ||
    process.env.OTS_SERVICE_URL ||
    "";
  return base.replace(/\/+$/, "");
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "POST required" }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      };
    }

    const id = body.id || body.proofId;
    const hash = (body.hash || "").toLowerCase();

    if (!id) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing id" }),
      };
    }
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid or missing 64-hex hash" }),
      };
    }

    const base = sidecarBase();
    if (!base) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "OTS sidecar URL not configured" }),
      };
    }

    // --- 1) Call Cloud Run OTS sidecar ------------------------------------
    const stampUrl = `${base}${STAMP_PATH}`;

    const sideRes = await fetch(stampUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hash }),
    });

    if (!sideRes.ok) {
      const text = await sideRes.text().catch(() => "");
      console.error("ots_submit: sidecar error", sideRes.status, text);
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: `Sidecar HTTP ${sideRes.status}`,
          body: text.slice(0, 500),
        }),
      };
    }

    const payload = await sideRes.json().catch(() => ({}));

    // Try a few common property names for base64 receipt
    const receiptB64 =
      payload.receiptBase64 ||
      payload.receipt ||
      payload.ots ||
      null;

    if (!receiptB64) {
      console.error("ots_submit: no receipt field in sidecar payload", payload);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Sidecar did not return a base64 receipt (adjust ots_submit.js)",
          raw: payload,
        }),
      };
    }

    const receiptBuf = Buffer.from(receiptB64, "base64");

    // --- 2) Store .ots file in Netlify Blobs ------------------------------
    const store = await getStoreSafe();
    if (!store) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "No Blobs store available" }),
      };
    }

    const key = `ots/receipts/${id}.ots`;

    await store.set(key, receiptBuf, {
      contentType: "application/octet-stream",
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id,
        state: "OTS_SUBMITTED",
        receiptKey: key,
      }),
    };
  } catch (err) {
    console.error("ots_submit error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(err && err.message || err) }),
    };
  }
};