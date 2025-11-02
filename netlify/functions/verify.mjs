// netlify/functions/verify.mjs
// Robust, helper-free verification that probes multiple stores.
// IMPORTANT: never calls obj.text()/obj.json(); always requests explicit types.

export const handler = async (event) => {
  try {
    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) return json(400, { ok: false, error: "missing ?id=" });

    const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
    const token  = (process.env.NETLIFY_BLOBS_TOKEN || "").trim();
    const primary = (process.env.BLOBS_STORE_NAME || "docuproof").trim();

    // The same discovery order your diag uses:
    const STORES = [
      primary,
      "docuproof",
      "ots",
      "default",
      "blobs",
      "public",
    ].filter(Boolean);

    const keys = [
      `ots/receipts/${id}.ots`,
      `ots:${id}.receipt`,
    ];

    const { getStore } = await import("@netlify/blobs");

    const probe = {};
    let receipt = null;
    let receiptKey = null;
    let receiptFoundInStore = null;

    // Helper: try to fetch in a type-safe way.
    async function fetchAny(store, key) {
      // Prefer bytes so we can measure length even for binary OTS files.
      try {
        const ab = await store.get(key, { type: "arrayBuffer" });
        if (ab) return { kind: "Bytes", bytes: ab.byteLength, ab };
      } catch (_) {}

      // Next, try text.
      try {
        const txt = await store.get(key, { type: "text" });
        if (typeof txt === "string") {
          return { kind: "Text", bytes: Buffer.byteLength(txt, "utf8"), text: txt };
        }
      } catch (_) {}

      // Finally, try JSON.
      try {
        const js = await store.get(key, { type: "json" });
        if (js != null) {
          const s = JSON.stringify(js);
          return { kind: "JSON", bytes: Buffer.byteLength(s, "utf8"), json: js };
        }
      } catch (_) {}

      return null;
    }

    // Probe both candidate keys across stores until we find one.
    for (const key of keys) {
      for (const name of STORES) {
        const store = getStore({ name, siteID, token });
        const res = await fetchAny(store, key);

        probe[key] ||= {};
        if (!res) {
          probe[key][name] = { ok: false, bytes: 0 };
          continue;
        }

        probe[key][name] = { ok: true, bytes: res.bytes, kind: res.kind };
        receipt = res;
        receiptKey = key;
        receiptFoundInStore = name;
        break;
      }
      if (receipt) break;
    }

    if (!receipt) {
      return json(200, {
        ok: true,
        id,
        authPath: "manual-blobs-token",
        primaryStore: primary,
        probedStores: STORES,
        tried: keys,
        probe,
        receiptAvailable: false,
        receiptKey: null,
        receiptFoundInStore: null,
        anchorKey: null,
        state: "NOT_FOUND",
        txid: null,
        confirmations: 0,
        hash: null,
      });
    }

    // Try to read the anchor sidecar JSON.
    const anchorKey = `anchor:${id}.json`;
    let anchor = null;
    for (const name of STORES) {
      const store = getStore({ name, siteID, token });
      // Prefer JSON; fall back to text -> JSON.parse
      try {
        anchor = await store.get(anchorKey, { type: "json" });
        if (anchor != null) break;
      } catch (_) {
        try {
          const txt = await store.get(anchorKey, { type: "text" });
          if (txt) {
            try { anchor = JSON.parse(txt); break; } catch {}
          }
        } catch {}
      }
    }

    return json(200, {
      ok: true,
      id,
      authPath: "manual-blobs-token",
      primaryStore: primary,
      probedStores: STORES,
      tried: keys,
      probe,
      receiptAvailable: true,
      receiptKey,
      receiptFoundInStore,
      anchorKey: anchor ? anchorKey : null,
      state: anchor?.state || "OTS_RECEIPT",
      txid: anchor?.txid ?? null,
      confirmations: anchor?.confirmations ?? 0,
      hash: anchor?.hash ?? null,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
};

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