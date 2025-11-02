// netlify/functions/anchor_status.mjs
// ESM — Return normalized anchoring status for a given id.
// Prefers the canonical JSON in the primary store (docuproof); falls back to other stores;
// if missing but receipt exists, infer OTS_RECEIPT.

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return json(405, { error: "GET required" });
    }
    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) return json(400, { error: "missing id" });

    const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
    const token  = (process.env.NETLIFY_BLOBS_TOKEN || "").trim();
    const primary = (process.env.BLOBS_STORE_NAME || "docuproof").trim();

    const { getStore } = await import("@netlify/blobs");

    // Keys we expect
    const anchorKey  = `anchor:${id}.json`;
    const receiptKey = `ots/receipts/${id}.ots`;
    const altReceipt = `ots:${id}.receipt`;

    // Preferred read order for anchor JSON
    const anchorStores = [primary, "docuproof", "ots", "default"];
    const anchor = await findFirstJson({ getStore, siteID, token, key: anchorKey, stores: anchorStores });

    // If we found a canonical anchor JSON, normalize and return it
    if (anchor?.json) {
      const { state = "OTS_RECEIPT", txid = null, confirmations = 0, updatedAt = null } = anchor.json || {};
      return json(200, {
        ok: true,
        id,
        state,
        txid,
        confirmations,
        anchorKey,
        foundInStore: anchor.store,
        updatedAt,
      });
    }

    // Otherwise, detect if a receipt exists anywhere we care about
    const receiptStores = [primary, "docuproof", "ots", "default"];
    const receipt = await findFirstBytes({ getStore, siteID, token, key: receiptKey, stores: receiptStores })
                || await findFirstBytes({ getStore, siteID, token, key: altReceipt,  stores: receiptStores });

    if (receipt) {
      // We can safely infer we’re in OTS_RECEIPT
      return json(200, {
        ok: true,
        id,
        state: "OTS_RECEIPT",
        txid: null,
        confirmations: 0,
        anchorKey,                // where resolve_now would (or did) place it
        inferredFromReceipt: true,
        receiptStore: receipt.store,
      });
    }

    // Nothing found
    return json(404, {
      ok: false,
      id,
      state: "NOT_FOUND",
      txid: null,
      confirmations: 0,
      tried: { anchorKey, receiptKey, altReceipt },
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
};

// ————— helpers —————

async function findFirstJson({ getStore, siteID, token, key, stores }) {
  for (const name of stores) {
    const store = getStore({ name, siteID, token });
    try {
      const t = await store.get(key, { type: "text" });
      if (t && t.length) {
        try {
          return { store: name, json: JSON.parse(t) };
        } catch { /* malformed json in this store; continue */ }
      }
    } catch { /* continue */ }
  }
  return null;
}

async function findFirstBytes({ getStore, siteID, token, key, stores }) {
  for (const name of stores) {
    const store = getStore({ name, siteID, token });
    try {
      const ab = await store.get(key, { type: "arrayBuffer" });
      if (ab && ab.byteLength > 0) return { store: name, bytes: ab.byteLength };
    } catch { /* continue */ }
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