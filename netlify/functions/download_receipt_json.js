// netlify/functions/download_receipt_json.js
// Return base64 of the .ots receipt so the Verify UI can decide
// whether to enable the "Download OTS receipt" button.

const { getStore } = require("@netlify/blobs");

async function getStoreSafe() {
  try {
    // Try automatic binding first
    return getStore("proofs");
  } catch {
    const siteID =
      process.env.NETLIFY_SITE_ID ||
      process.env.SITE_ID ||
      process.env.SITE_NAME ||
      null;

    const token =
      process.env.NETLIFY_BLOBS_TOKEN ||
      process.env.BLOBS_TOKEN ||
      null;

    if (!siteID || !token) return null;

    try {
      // Older SDK signature
      return getStore({ name: "proofs", siteID, token });
    } catch {
      return null;
    }
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return {
        statusCode: 405,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "GET required" }),
      };
    }

    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "missing id" }),
      };
    }

    const store = await getStoreSafe();
    if (!store) {
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Blobs store not available" }),
      };
    }

    const key = `ots/receipts/${id}.ots`;

    let ab;
    try {
      ab = await store.get(key, { type: "arrayBuffer" });
    } catch (e) {
      ab = null;
    }

    if (!ab || !ab.byteLength) {
      return {
        statusCode: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ok: false, error: "receipt not found", id, key }),
      };
    }

    const buf = Buffer.from(ab);
    const b64 = buf.toString("base64");

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id,
        key,
        size: buf.length,
        base64: b64,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e?.message || e) }),
    };
  }
};
