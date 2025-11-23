// netlify/functions/ots_submit.js
// Submit a hash to the OTS sidecar and store the .ots receipt in Netlify Blobs.

const OTS_BASE =
  process.env.OTS_SERVICE_URL ||
  process.env.OTS_SIDECAR_URL ||
  "";

// Sidecar lives at the root path (we probed /, /stamp, /stamp-hash)
const STAMP_PATH = ""; // root

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

      const storeName = process.env.BLOBS_STORE_NAME || "docuproof";

      if (!siteID || !token) {
        console.error("getStoreSafe: missing siteID/token");
        return null;
      }

      if (mod.BlobsClient) {
        const client = new mod.BlobsClient({ siteID, token });
        return client.getStore(storeName);
      }

      return mod.getStore({ name: storeName, siteID, token });
    } catch (e) {
      console.error("getStoreSafe error:", e);
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      };
    }

    if (!OTS_BASE) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "OTS service URL not configured" }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      };
    }

    const id = (body.id || "").trim();
    const hash = (body.hash || "").trim();

    if (!id) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Missing id" }),
      };
    }

    if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid or missing hash" }),
      };
    }

    const target =
      OTS_BASE.replace(/\/$/, "") + (STAMP_PATH || "");

    // 1) Call the sidecar at the root path with { id, hash }
    const resp = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hash }),
    });

    const text = await resp.text();
    let sidecarJson = null;
    try {
      sidecarJson = JSON.parse(text);
    } catch {
      sidecarJson = null;
    }

    if (!resp.ok) {
      return {
        statusCode: 502,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: `Sidecar HTTP ${resp.status}`,
          body: text,
        }),
      };
    }

    const receiptB64 =
      (sidecarJson && (sidecarJson.receipt_b64 || sidecarJson.receipt)) || null;

    if (!receiptB64) {
      return {
        statusCode: 502,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Sidecar did not return a receipt_b64 field",
          body: sidecarJson,
        }),
      };
    }

    // 2) Store the receipt in the same Blobs store that anchor_status/diag_receipt use
    const store = await getStoreSafe();
    if (!store) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Netlify Blobs not configured",
        }),
      };
    }

    const rawBuf = Buffer.from(receiptB64, "base64");
    const receiptKey = `ots/receipts/${id}.ots`;
    const altKey = `ots:${id}.receipt`;

    // Binary .ots (for independent verification)
    await store.set(receiptKey, rawBuf, {
      contentType: "application/octet-stream",
    });

    // JSON helper used by download_receipt_json / verify_page
    await store.set(
      altKey,
      JSON.stringify({ base64: receiptB64, key: receiptKey }),
      { contentType: "application/json" }
    );

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id,
        receiptKey,
        altKey,
        sidecar: { ok: true },
      }),
    };
  } catch (err) {
    console.error("ots_submit error:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};