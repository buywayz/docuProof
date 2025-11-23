// netlify/functions/ots_submit.js
// Submit a hash to the OTS sidecar and store the .ots receipt in Netlify Blobs.

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
      console.error("ots_submit: missing siteID/token", {
        siteID: !!siteID,
        token: !!token,
      });
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

const OTS_BASE =
  process.env.OTS_SERVICE_URL ||
  process.env.OTS_SIDECAR_URL ||
  "";

const STAMP_PATH = "/stamp-hash";

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
        body: JSON.stringify({ ok: false, error: "OTS sidecar URL not set" }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      };
    }

    const id = body.id;
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
        body: JSON.stringify({ ok: false, error: "Invalid or missing hash" }),
      };
    }

    const url = `${OTS_BASE}${STAMP_PATH}`;

    const sidecarRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hash }),
    });

    const sidecarText = await sidecarRes.text();
    let sidecarJson = null;

    try {
      sidecarJson = JSON.parse(sidecarText);
    } catch {}

    if (!sidecarRes.ok || !sidecarJson?.ok || !sidecarJson?.receipt_b64) {
      console.error("ots_submit: sidecar error", {
        status: sidecarRes.status,
        body: sidecarText,
      });

      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Sidecar failed",
          status: sidecarRes.status,
          sidecar: sidecarJson || sidecarText,
        }),
      };
    }

    const store = await getStoreSafe();
    if (!store) {
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
    const receiptBuf = Buffer.from(sidecarJson.receipt_b64, "base64");

    await store.set(receiptKey, receiptBuf, {
      contentType: "application/octet-stream",
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id,
        receiptKey,
      }),
    };
  } catch (err) {
    console.error("ots_submit error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: err.message || String(err),
      }),
    };
  }
};
