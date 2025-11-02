// netlify/functions/resolve_now.mjs
// ESM — Normalize/refresh anchor metadata for a given id.
// Writes canonical JSON into the primary store (docuproof) so UI / verify flow is consistent.

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "POST required" });
    }
    const body = safeJson(event.body);
    const id = (body?.id || "").trim();
    if (!id) return json(400, { ok: false, error: "missing id" });

    const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
    const token  = (process.env.NETLIFY_BLOBS_TOKEN || "").trim();
    const primary = (process.env.BLOBS_STORE_NAME || "docuproof").trim();

    const { getStore } = await import("@netlify/blobs");

    // Where we’ll *write* the canonical anchor json:
    const target = getStore({ name: primary, siteID, token });

    // Keys we care about
    const receiptFileKey = `ots/receipts/${id}.ots`;
    const receiptAltKey  = `ots:${id}.receipt`;
    const anchorKey      = `anchor:${id}.json`;

    // Probe receipts in a small set of likely stores
    const probeStores = [primary, "docuproof", "ots", "default"];
    const receipt = await findFirstBytes({ getStore, siteID, token, key: receiptFileKey, stores: probeStores })
                   || await findFirstBytes({ getStore, siteID, token, key: receiptAltKey,  stores: probeStores });

    if (!receipt) {
      return json(404, {
        ok: false,
        error: "receipt not found for id",
        id,
        tried: [receiptFileKey, receiptAltKey],
      });
    }

    // Try to read existing anchor JSON from any store; if absent, we’ll create it in the primary store.
    const anchorExisting = await findFirstText({ getStore, siteID, token, key: anchorKey, stores: probeStores });
    let changed = false;

    if (!anchorExisting) {
      const anchorObj = {
        id,
        state: "OTS_RECEIPT",
        txid: null,
        confirmations: 0,
        updatedAt: new Date().toISOString(),
      };
      await target.set(anchorKey, JSON.stringify(anchorObj), { contentType: "application/json" });
      changed = true;
    } else {
      // Optionally update timestamp but keep current object shape if you prefer:
      // Here we leave existing JSON untouched to avoid racing external resolvers.
    }

    return json(200, {
      ok: true,
      id,
      state: "OTS_RECEIPT",
      txid: null,
      confirmations: 0,
      receiptRef: receipt.foundKey,
      anchorKey,
      changed,
      primaryStore: primary,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
};

// Helpers
function safeJson(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

async function findFirstBytes({ getStore, siteID, token, key, stores }) {
  for (const name of stores) {
    const store = getStore({ name, siteID, token });
    try {
      const ab = await store.get(key, { type: "arrayBuffer" });
      if (ab && ab.byteLength > 0) return { store: name, foundKey: key, bytes: ab.byteLength };
    } catch { /* next */ }
  }
  return null;
}

async function findFirstText({ getStore, siteID, token, key, stores }) {
  for (const name of stores) {
    const store = getStore({ name, siteID, token });
    try {
      const t = await store.get(key, { type: "text" });
      if (t && t.length > 0) return { store: name, foundKey: key, length: t.length, text: t };
    } catch { /* next */ }
  }
  return null;
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}