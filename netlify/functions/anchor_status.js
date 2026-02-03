// netlify/functions/anchor_status.js
// v3.0.0 - FIXED: When anchor JSON says PENDING, also checks for receipt existence
// Also converted from ESM export to CommonJS for package.json "type":"commonjs" consistency

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return json(405, { error: "GET required" });
    }
    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) return json(400, { error: "missing id" });

    const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
    const token  = (process.env.NETLIFY_BLOBS_TOKEN || "").trim();
    const primary = (process.env.BLOBS_STORE_NAME || "proofs").trim();

    const { getStore } = await import("@netlify/blobs");

    const anchorKey  = `anchor:${id}.json`;
    const receiptKey = `ots/receipts/${id}.ots`;
    const altReceipt = `ots:${id}.receipt`;

    const anchorStores = [primary, "proofs", "docuproof", "ots", "default"];
    const anchor = await findFirstJson({ getStore, siteID, token, key: anchorKey, stores: anchorStores });

    if (anchor?.json) {
      let {
        state = "OTS_RECEIPT",
        txid = null,
        blockHeight = null,
        confirmations = 0,
        updatedAt = null,
        createdAt = null
      } = anchor.json || {};

      // CRITICAL FIX: If state is bare PENDING, check if a receipt actually exists
      // This handles the gap where ots_submit stored receipt but anchor JSON wasn't updated
      if (state === "PENDING") {
        const receiptStores = [primary, "proofs", "docuproof", "ots", "default"];
        const receipt = await findFirstBytes({ getStore, siteID, token, key: receiptKey, stores: receiptStores })
                     || await findFirstBytes({ getStore, siteID, token, key: altReceipt,  stores: receiptStores });

        if (receipt) {
          state = "OTS_RECEIPT";
        }
      }

      const isAnchored = state === "ANCHORED" && blockHeight && blockHeight > 0;

      return json(200, {
        ok: true,
        id,
        state: isAnchored ? "ANCHORED" : (state === "ANCHORED" ? "PENDING" : state),
        txid,
        blockHeight: blockHeight || null,
        block: blockHeight || null,
        confirmations: isAnchored ? confirmations : 0,
        anchorKey,
        foundInStore: anchor.store,
        updatedAt,
        createdAt,
      });
    }

    // No anchor JSON found — check for receipt as before
    const receiptStores = [primary, "proofs", "docuproof", "ots", "default"];
    const receipt = await findFirstBytes({ getStore, siteID, token, key: receiptKey, stores: receiptStores })
                 || await findFirstBytes({ getStore, siteID, token, key: altReceipt,  stores: receiptStores });

    if (receipt) {
      return json(200, {
        ok: true,
        id,
        state: "OTS_RECEIPT",
        txid: null,
        blockHeight: null,
        block: null,
        confirmations: 0,
        anchorKey,
        inferredFromReceipt: true,
        receiptStore: receipt.store,
      });
    }

    return json(404, {
      ok: false,
      id,
      state: "NOT_FOUND",
      txid: null,
      blockHeight: null,
      block: null,
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
        } catch {}
      }
    } catch {}
  }
  return null;
}

async function findFirstBytes({ getStore, siteID, token, key, stores }) {
  for (const name of stores) {
    const store = getStore({ name, siteID, token });
    try {
      const ab = await store.get(key, { type: "arrayBuffer" });
      if (ab && ab.byteLength > 0) return { store: name, bytes: ab.byteLength };
    } catch {}
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
