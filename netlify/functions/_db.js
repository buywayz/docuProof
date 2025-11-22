// netlify/functions/_db.js
// Persistence via Netlify Blobs (with safe dynamic import for CJS functions).

// Memoized dynamic import so we only resolve the module once per cold start.
let _storePromise = null;

// Minimal and robust Netlify Blobs access layer
async function getStoreSafe() {
  if (_storePromise) return _storePromise;

  _storePromise = (async () => {
    try {
      const mod = await import("@netlify/blobs");

      // First try the automatic environment binding (recommended by Netlify)
      try {
        // Named store "proofs"
        return mod.getStore("proofs");
      } catch {
        // Manual fallback if environment isn’t fully configured
        const siteID =
          process.env.NETLIFY_SITE_ID ||
          process.env.SITE_ID ||
          process.env.SITE_NAME ||
          null;

        const token =
          process.env.NETLIFY_BLOBS_TOKEN ||
          process.env.BLOBS_TOKEN ||
          null;

        if (siteID && token) {
          // Newer SDKs expose BlobsClient, older ones only getStore(options)
          if (mod.BlobsClient) {
            const client = new mod.BlobsClient({ siteID, token });
            return client.getStore("proofs");
          }

          // Legacy style
          return mod.getStore({ name: "proofs", siteID, token });
        }

        // No usable configuration
        return null;
      }
    } catch (err) {
      // Blobs SDK not available at all (local/dev or older env)
      console.error("getStoreSafe: failed to import @netlify/blobs:", err);
      return null;
    }
  })();

  return _storePromise;
}

// In-memory fallback (only used if Blobs are unavailable; process-local only)
const memFallback = new Map();

/**
 * Normalize and validate a proof record going into storage.
 */
function normalizeRecord(meta) {
  if (!meta || !meta.id) {
    throw new Error('normalizeRecord: "id" is required');
  }

  const now = new Date().toISOString();

  return {
    id: meta.id,
    filename: meta.filename || null,
    displayName: meta.displayName || null,
    hash: meta.hash || null,
    customerEmail: meta.customerEmail || meta.email || null,
    createdAt: meta.createdAt || now,
    source: meta.source || "stripe_webhook",
    version: 1,
  };
}

/**
 * Persist a proof record by its canonical key. Idempotent (overwrite).
 */
async function saveProof(meta) {
  const record = normalizeRecord(meta);
  const key = `proof:${record.id}`;

  const store = await getStoreSafe();
  if (store) {
    await store.set(key, JSON.stringify(record), {
      contentType: "application/json",
    });
    return record;
  }

  // Volatile fallback (local/dev only)
  memFallback.set(key, record);
  return record;
}

/**
 * Append a compact entry to rolling feeds:
 *  - "feed:all"
 *  - "feed:email:<email>"
 * Keeps up to 200 recent items, newest first.
 */
async function appendToFeeds(record) {
  const store = await getStoreSafe();
  if (!store) return; // if not available, skip silently

  const entry = {
    id: record.id,
    createdAt: record.createdAt,
    filename: record.filename || null,
    displayName: record.displayName || null,
    hash: record.hash || null,
    customerEmail: record.customerEmail || null,
  };

  async function writeFeed(key) {
    try {
      let feed = await store.get(key, { type: "json" });
      if (!Array.isArray(feed)) feed = [];

      // prepend newest
      feed.unshift(entry);
      if (feed.length > 200) feed = feed.slice(0, 200);

      await store.set(key, JSON.stringify(feed), {
        contentType: "application/json",
      });
    } catch (err) {
      // feeds are best-effort; never break the webhook on this
      console.error("appendToFeeds error for", key, err);
    }
  }

  await writeFeed("feed:all");
  if (record.customerEmail) {
    await writeFeed(`feed:email:${record.customerEmail}`);
  }
}

/**
 * Read recent proofs from the rolling feeds.
 * If email is provided, returns that user’s feed; otherwise global feed.
 */
async function listProofs({ email, limit = 50 } = {}) {
  const store = await getStoreSafe();
  if (!store) return [];

  const key = email ? `feed:email:${email}` : "feed:all";

  try {
    const feed = await store.get(key, { type: "json" });
    if (!Array.isArray(feed)) return [];
    return feed.slice(0, limit);
  } catch (err) {
    console.error("listProofs error:", err);
    return [];
  }
}

/**
 * Retrieve a proof record by id, or null if missing.
 */
async function getProof(id) {
  if (!id) throw new Error('getProof: "id" is required');

  const store = await getStoreSafe();
  if (!store) {
    // fall back to in-memory store if present
    const k = `proof:${id}`;
    return memFallback.get(k) || null;
  }

  const keys = [`proof:${id}`, `proof:${id}.json`];

  for (const key of keys) {
    try {
      const j = await store.get(key, { type: "json" });
      if (j && typeof j === "object") return j;
    } catch {
      // ignore and try raw
    }

    try {
      const val = await store.get(key);
      if (!val) continue;

      if (typeof val === "string") return JSON.parse(val);
      if (val && typeof val.text === "function") {
        return JSON.parse(await val.text());
      }
    } catch (err) {
      console.error("getProof parse error for", key, err);
    }
  }

  return null;
}

/**
 * Quiet health check used by /env_dump or other diagnostics.
 */
async function ping() {
  const store = await getStoreSafe();
  return { blobsReady: !!store };
}

module.exports = {
  saveProof,
  appendToFeeds,
  listProofs,
  getProof,
  ping,
};