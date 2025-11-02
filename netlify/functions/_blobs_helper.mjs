// netlify/functions/_blobs_helper.mjs
// Unified Blobs helper (ESM) that probes multiple possible store names.
// Writes always go to the primary store, reads probe across all stores.
// Auth preference: NETLIFY_BLOBS_TOKEN (data-plane) > NETLIFY_FUNCTIONS_TOKEN.

export function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

// Primary canonical store name
const PRIMARY_STORE = (process.env.BLOBS_STORE_NAME || "docuproof").trim();

// Additional legacy/compat store names we’ll probe for reads in this order
const LEGACY_STORES = [
  PRIMARY_STORE,     // 1) canonical
  "ots",             // 2) older name candidates
  "default",
  "blobs",
  "public",
];

async function bindWithToken(tokenEnvVar) {
  const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
  const token  = (process.env[tokenEnvVar] || "").trim();
  if (!siteID || !token) return null;
  const { getStore } = await import("@netlify/blobs");
  // Return bound getStore function that can produce stores for arbitrary names
  const mkStore = (name) => getStore({ name, siteID, token });
  return {
    mkStore,
    authPath: tokenEnvVar === "NETLIFY_BLOBS_TOKEN"
      ? "manual-blobs-token"
      : "manual-functions-token"
  };
}

async function getBinding() {
  // Strongest: data-plane token (worked in your diagnostics)
  let b = await bindWithToken("NETLIFY_BLOBS_TOKEN");
  if (b) return b;

  // Optional fallback (often 401, but keep for completeness)
  b = await bindWithToken("NETLIFY_FUNCTIONS_TOKEN");
  if (b) return b;

  throw new Error(
    "Netlify Blobs not configured. Set NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN."
  );
}

export async function makeBlobHelpers() {
  const binding = await getBinding();
  const { mkStore, authPath } = binding;

  // Build store objects for probing reads (dedup names)
  const seen = new Set();
  const readStores = [];
  for (const name of LEGACY_STORES) {
    const n = (name || "").trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    readStores.push({ name: n, store: mkStore(n) });
  }

  // Primary store for writes
  const primaryStore = mkStore(PRIMARY_STORE);

  async function readObj(store, key) {
    const obj = await store.get(key);
    if (!obj) return { type: null, data: null };
    if (obj.type === "Bytes") {
      const ab = await obj.arrayBuffer();
      return { type: "Bytes", data: new Uint8Array(ab) };
    }
    if (obj.type === "Text") {
      const t = await obj.text();
      return { type: "Text", data: Buffer.from(t, "utf8") };
    }
    if (obj.type === "JSON") {
      const j = await obj.json();
      const s = JSON.stringify(j);
      return { type: "JSON", data: Buffer.from(s, "utf8") };
    }
    return { type: obj.type || "Unknown", data: null };
  }

  // Extended: returns { bytes, storeName } for diagnostics
  async function getBytesEx(key) {
    for (const { name, store } of readStores) {
      const { data } = await readObj(store, key);
      if (data && data.length > 0) return { bytes: data, storeName: name };
    }
    return { bytes: null, storeName: null };
  }

  // Compatibility: just bytes (first hit)
  async function getBytes(key) {
    const { bytes } = await getBytesEx(key);
    return bytes;
  }

  async function getText(key) {
    const res = await getBytesEx(key);
    if (!res.bytes) return null;
    return Buffer.from(res.bytes).toString("utf8");
  }

  async function getJson(key) {
    const t = await getText(key);
    if (!t) return null;
    try { return JSON.parse(t); } catch { return null; }
  }

  // Writes always to PRIMARY_STORE
  async function setJson(key, value) {
    const s = JSON.stringify(value);
    await primaryStore.set(key, s, {
      contentType: "application/json; charset=utf-8"
    });
  }

  async function setBytes(key, bytes, contentType = "application/octet-stream") {
    await primaryStore.set(key, bytes, { contentType });
  }

  return {
    authPath,
    PRIMARY_STORE,
    READ_STORES: readStores.map(r => r.name),
    getBytesEx,
    getBytes,
    getText,
    getJson,
    setJson,
    setBytes,
  };
}