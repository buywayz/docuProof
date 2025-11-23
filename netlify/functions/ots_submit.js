// netlify/functions/ots_submit.js
// Submit a hash to the OTS sidecar and store the .ots receipt in Netlify Blobs.

const STAMP_PATH = "/stamp-hash"; // path on the sidecar (base URL from env)
const OTS_BASE =
  process.env.OTS_SERVICE_URL ||
  process.env.OTS_SIDECAR_URL ||
  "";

// Lazy, shared Blobs store using the same manual-blobs-token path
let storePromise = null;
async function getStoreSafe() {
  if (storePromise) return storePromise;

  storePromise = (async () => {
    try {
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
        console.error("getStoreSafe: missing siteID/token", {
          siteID: !!siteID,
          token: !!token,
        });
        return null;
      }

      const storeName = process.env.BLOBS_STORE_NAME || "docuproof";

      if (mod.BlobsClient) {
        const client = new mod.BlobsClient({ siteID, token });
        return client.getStore(storeName);
      }

      return mod.getStore({ name: storeName, siteID, token });
    } catch (err) {
      console.error("getStoreSafe error:", err);
      return null;
    }
  })();

  return storePromise;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      };
    }

    if (!OTS_BASE) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "OTS service URL missing" }),
      };
    }

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      };
    }

    const id = body.id;
    const hash = (body.hash || "").toLowerCase();

    if (!id || typeof id !== "string") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing id" }),
      };
    }

    if (!/^[0-9a-f]{64}$/.test(hash)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid or missing hash" }),
      };
    }

    // 1) Call the OTS sidecar
    const sidecarUrl = OTS_BASE.replace(/\/$/, "") + STAMP_PATH;

    const sidecarRes = await fetch(sidecarUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hash }),
    });

    const sidecarText = await sidecarRes.text();
    let sidecarJson = null;
    try {
      sidecarJson = JSON.parse(sidecarText);
    } catch {
      // leave as null; we might have gotten raw data, but we expect JSON
    }

    if (!sidecarRes.ok) {
      console.error("OTS sidecar error:", sidecarRes.status, sidecarText);
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: `Sidecar HTTP ${sidecarRes.status}`,
          body: sidecarText,
        }),
      };
    }

    const receiptB64 =
      (sidecarJson && (sidecarJson.receipt_b64 || sidecarJson.receipt)) || null;

    if (!receiptB64) {
      console.error("OTS sidecar: no receipt_b64 in response", sidecarText);
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Sidecar response missing receipt_b64",
        }),
      };
    }

    // 2) Store the .ots receipt + a simple anchor record in Blobs
    const store = await getStoreSafe();
    if (!store) {
      console.error("ots_submit: no Blobs store available");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Blobs store not available",
        }),
      };
    }

    const receiptKey = `ots/receipts/${id}.ots`;
    const anchorKey = `anchor:${id}.json`;

    const receiptBytes = Buffer.from(receiptB64, "base64");

    // Binary .ots receipt
    await store.set(receiptKey, receiptBytes, {
      contentType: "application/vnd.opentimestamps.ots",
    });

    // Minimal anchor metadata
    const anchorRecord = {
      id,
      hash,
      state: "OTS_SUBMITTED",
      receiptKey,
      createdAt: new Date().toISOString(),
      source: "ots_submit",
    };

    await store.set(anchorKey, JSON.stringify(anchorRecord), {
      contentType: "application/json",
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id,
        receiptKey,
        anchorKey,
      }),
    };
  } catch (err) {
    console.error("ots_submit handler error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Internal server error",
        message: String(err?.message || err),
      }),
    };
  }
};