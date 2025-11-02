// netlify/functions/diag_receipt.mjs
// ESM; probes both canonical and legacy receipt keys and reports size/preview.

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getQuery(event) {
  const qs = event.queryStringParameters || {};
  return { id: qs.id || "" };
}

async function loadStore() {
  // Prefer explicit manual binding (works in your environment)
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN; // fallback if needed
  if (!siteID || !token) {
    throw new Error("Missing NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN");
  }
  const mod = await import("@netlify/blobs");
  const getStore = mod.getStore || (mod.default && mod.default.getStore);
  if (!getStore) throw new Error("getStore not exported by @netlify/blobs");
  return getStore({ name: "default", siteID, token });
}

function b64head(buf, n = 32) {
  if (!buf || !buf.length) return null;
  const head = buf.subarray(0, Math.min(n, buf.length));
  return Buffer.from(head).toString("base64");
}

export const handler = async (event) => {
  try {
    const { id } = getQuery(event);
    if (!id) return json(400, { error: "missing ?id=" });

    const store = await loadStore();

    // Candidate keys we use across the app
    const candidates = [
      `ots/receipts/${id}.ots`,  // canonical
      `ots:${id}.receipt`,       // legacy alias
      `anchor:${id}.json`        // status json
    ];

    const out = [];
    for (const key of candidates) {
      try {
        const ab = await store.get(key, { type: "arrayBuffer" });
        if (!ab) {
          out.push({ key, exists: false });
        } else {
          const buf = Buffer.from(ab);
          out.push({
            key,
            exists: true,
            bytes: buf.length,
            b64_head_32: b64head(buf, 32),     // quick fingerprint
            text_head_80: buf.toString("utf8", 0, Math.min(buf.length, 80)) // human peek (may be binary garbage)
          });
        }
      } catch (e) {
        out.push({ key, error: e?.message || String(e) });
      }
    }

    // Also verify we can write/read a tiny probe under a temp key (auth sanity)
    const probeKey = `diag/probe-${id}-${Date.now()}.txt`;
    let probe = null;
    try {
      const payload = `ok ${new Date().toISOString()}`;
      await store.set(probeKey, payload, { metadata: { contentType: "text/plain; charset=utf-8" } });
      const back = await store.get(probeKey, { type: "text" });
      probe = { wrote: payload.length, read: (back || "").length, text: back || null, key: probeKey };
    } catch (e) {
      probe = { error: e?.message || String(e), key: probeKey };
    }

    return json(200, {
      ok: true,
      id,
      site: process.env.NETLIFY_SITE_ID || null,
      authPath: "manual-blobs-token",
      keys: out,
      probe
    });
  } catch (e) {
    return json(500, { error: e.message });
  }
};