cat > netlify/functions/debug_blobs.js <<'EOF'
// netlify/functions/debug_blobs.js
// Read-only debugger for Netlify Blobs (always returns JSON).
// Usage:
//   /.netlify/functions/debug_blobs?ping=1
//   /.netlify/functions/debug_blobs?index=1
//   /.netlify/functions/debug_blobs?id=cs_live_123
//   /.netlify/functions/debug_blobs?key=anchors/index.json

async function getDefaultStore() {
  const mod = await import("@netlify/blobs");
  const gs = mod.getStore || (mod.default && mod.default.getStore);
  if (!gs) throw new Error("getStore not available from @netlify/blobs");
  try {
    return gs("default");
  } catch (e) {
    const msg = e?.message || "";
    if (!/not been configured|requires the name of the store|is not configured/i.test(msg)) throw e;
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token  = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
    if (!siteID || !token) throw new Error("Netlify Blobs not bound and manual credentials missing.");
    return gs({ name: "default", siteID, token });
  }
}

function json(status, obj) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(obj, null, 2),
  };
}

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    if (params.get("ping")) {
      return json(200, { ok: true, ping: "pong", envBound: Boolean(process.env.URL || process.env.DEPLOY_URL) });
    }

    const indexFlag = params.get("index");
    const idParam   = params.get("id");
    const keyParam  = params.get("key");

    let key = null;
    if (keyParam) key = keyParam;
    else if (idParam) key = `anchor:${idParam}.json`;
    else if (indexFlag) key = "anchors/index.json";

    if (!key) {
      return json(400, {
        ok: false,
        error: "Missing query. Use one of: ?ping=1 | ?index=1 | ?id=<proofId> | ?key=<blob-key>",
        examples: [
          "/.netlify/functions/debug_blobs?ping=1",
          "/.netlify/functions/debug_blobs?index=1",
          "/.netlify/functions/debug_blobs?id=cs_live_ABC123",
          "/.netlify/functions/debug_blobs?key=anchors/index.json",
        ],
      });
    }

    const store = await getDefaultStore();
    const buf = await store.get(key, { type: "arrayBuffer" });

    if (!buf) return json(404, { ok: false, key, error: "Blob not found" });

    const raw = Buffer.from(buf);
    let parsed = null;
    try { parsed = JSON.parse(raw.toString("utf8")); } catch (_) {}

    return json(200, {
      ok: true,
      key,
      size: raw.length,
      kind: parsed ? "json" : "binary",
      data: parsed || { base64: raw.toString("base64").slice(0, 256) + (raw.length > 192 ? "…(truncated)" : "") },
    });
  } catch (err) {
    console.error("[debug_blobs] error:", err);
    return json(500, { ok: false, error: err.message || String(err) });
  }
};
EOF
