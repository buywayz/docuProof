// netlify/functions/debug_blobs.js
// Read-only debugger for Netlify Blobs (JSON responses only)

async function getDefaultStore() {
  const mod = await import("@netlify/blobs");
  const gs = mod.getStore || (mod.default && mod.default.getStore);
  if (!gs) throw new Error("getStore not available from @netlify/blobs");

  try {
    // Attempt env-bound store first (the usual production binding)
    return gs("default");
  } catch (e) {
    // Fallback to manual credentials when running unbound
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token  = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN || process.env.BLOBS_TOKEN;
    if (!siteID || !token) throw e;
    return gs({ name: "default", siteID, token });
  }
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    if (params.get("ping")) {
      return json(200, { ok: true, ping: "pong" });
    }

    const key = params.get("key");
    if (!key) {
      return json(400, {
        ok: false,
        error: "Missing ?key=… or use ?ping=1",
        examples: [
          "/.netlify/functions/debug_blobs?ping=1",
          "/.netlify/functions/debug_blobs?key=anchor:YOUR_ID.json"
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
      bytes: raw.length,
      isJSON: parsed !== null,
      valuePreview: parsed ?? raw.toString("utf8").slice(0, 200),
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || String(err) });
  }
};