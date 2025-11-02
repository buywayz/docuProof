// netlify/functions/discover_receipt_store.mjs
// Try many candidate store names to find where a given receipt actually lives.
// Usage:
//   /.netlify/functions/discover_receipt_store?id=cs_test_email012
// Also try with a known-good id (e.g. cs_test_email004).

export const handler = async (event) => {
  try {
    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) {
      return resp(400, { ok: false, error: "missing ?id=" });
    }

    const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
    const token  = (process.env.NETLIFY_BLOBS_TOKEN || "").trim();
    if (!siteID || !token) {
      return resp(500, { ok: false, error: "NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN not set" });
    }

    // Import here to avoid CJS/ESM interop issues
    const { getStore } = await import("@netlify/blobs");

    // Candidate store names (broad list; we’ll report which ones match)
    const candidates = dedup([
      // current + obvious
      (process.env.BLOBS_STORE_NAME || "docuproof").trim(),
      "docuproof",
      "docuproof-store",
      "docuproof-proofs",
      "docuproof-receipts",
      "proofs",
      "receipts",
      "anchors",
      "anchor",
      // legacy/common guesses
      "ots",
      "default",
      "public",
      "blobs",
      "data",
      "store",
    ]).filter(Boolean);

    const keysToTry = [
      `ots/receipts/${id}.ots`,
      `ots:${id}.receipt`,
      `anchor:${id}.json`,
    ];

    const findings = [];
    for (const name of candidates) {
      const store = getStore({ name, siteID, token });
      const checks = [];
      for (const key of keysToTry) {
        const obj = await store.get(key);
        const ok  = !!obj;
        let len = 0;
        if (ok) {
          if (obj.type === "Bytes") {
            const ab = await obj.arrayBuffer();
            len = ab.byteLength;
          } else if (obj.type === "Text") {
            const t = await obj.text();
            len = Buffer.byteLength(t, "utf8");
          } else if (obj.type === "JSON") {
            const j = await obj.json();
            len = Buffer.byteLength(JSON.stringify(j), "utf8");
          }
        }
        checks.push({ key, ok, bytes: len, type: obj?.type || null });
      }
      // Record only stores where at least one object matched
      if (checks.some(c => c.ok && c.bytes > 0)) {
        findings.push({ store: name, matches: checks });
      }
    }

    return resp(200, {
      ok: true,
      id,
      siteID: mask(siteID),
      triedStoresCount: candidates.length,
      foundIn: findings,
      note: findings.length
        ? "Add the discovered store(s) to _blobs_helper.mjs LEGACY_STORES."
        : "No stores matched; verify the id or try a known-good id like cs_test_email004."
    });
  } catch (e) {
    return resp(500, { ok: false, error: e.message });
  }
};

function resp(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function dedup(arr) {
  const seen = new Set();
  const out = [];
  for (const s of arr) {
    const t = (s || "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function mask(s) {
  if (!s) return s;
  if (s.length <= 6) return s;
  return s.slice(0, 4) + "…" + s.slice(-2);
}