// netlify/functions/download_receipt.js
// Stream the raw .ots receipt bytes for a given proof id.

const { getStore } = require("@netlify/blobs");

async function getStoreSafe() {
  try {
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
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${id}.ots"`,
        "cache-control": "no-store",
      },
      body: b64,
      isBase64Encoded: true,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: String(e?.message || e) }),
    };
  }
};
