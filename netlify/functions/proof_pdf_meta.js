// netlify/functions/proof_pdf_meta.js
// v8.0.0 — FIXED: Now passes hash to proof_pdf (was missing, caused "N/A" on certificate)
// Helper: given ?id=..., look up proof metadata AND anchor status in Blobs
// and redirect to proof_pdf with all fields filled in.

const { getProof } = require("./_db");

// We need direct blob access for anchor status since _db.js doesn't export it
let _storePromise = null;

async function getStoreSafe() {
  if (_storePromise) return _storePromise;

  _storePromise = (async () => {
    try {
      const mod = await import("@netlify/blobs");
      try {
        return mod.getStore("proofs");
      } catch {
        const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || null;
        const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.BLOBS_TOKEN || null;
        if (siteID && token) {
          return mod.getStore({ name: "proofs", siteID, token });
        }
        return null;
      }
    } catch {
      return null;
    }
  })();

  return _storePromise;
}

async function getAnchorStatus(id) {
  const store = await getStoreSafe();
  if (!store) return null;
  
  const key = `anchor:${id}.json`;
  try {
    const raw = await store.get(key, { type: "json" });
    if (raw && typeof raw === "object") return raw;
  } catch {}
  
  // Try alternate parsing
  try {
    const val = await store.get(key);
    if (!val) return null;
    if (typeof val === "string") return JSON.parse(val);
    if (val && typeof val.text === "function") return JSON.parse(await val.text());
  } catch {}
  
  return null;
}

exports.handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const id = (qp.id || "").trim();

  if (!id) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ ok: false, error: "Missing id" }),
    };
  }

  // Defaults (if lookup fails)
  let filename = "document";
  let displayName = "Untitled";
  let createdAt = new Date().toISOString();
  let hash = null;
  let blockHeight = null;
  let verifyUrl = `https://docuproof.io/v/${encodeURIComponent(id)}`;

  // Get proof record (filename, displayName, createdAt)
  try {
    const proof = await getProof(id);
    if (proof && typeof proof === "object") {
      if (proof.filename && typeof proof.filename === "string") {
        filename = proof.filename;
      }
      if (proof.displayName && typeof proof.displayName === "string") {
        displayName = proof.displayName;
      }
      if (proof.createdAt && typeof proof.createdAt === "string") {
        createdAt = proof.createdAt;
      }
      if (proof.hash && typeof proof.hash === "string") {
        hash = proof.hash;
      }
    }
  } catch (e) {
    console.error("proof_pdf_meta getProof error:", e);
  }

  // Get anchor status (blockHeight)
  try {
    const anchor = await getAnchorStatus(id);
    if (anchor && typeof anchor === "object") {
      if (anchor.blockHeight && typeof anchor.blockHeight === "number") {
        blockHeight = anchor.blockHeight;
      }
      // Fallback: get hash from anchor record if not found in proof record
      if (!hash && anchor.hash && typeof anchor.hash === "string") {
        hash = anchor.hash;
      }
    }
  } catch (e) {
    console.error("proof_pdf_meta getAnchorStatus error:", e);
  }

  const params = new URLSearchParams({
    id,
    filename,
    displayName,
    verifyUrl,
    createdAt,
  });

  // Add hash if available
  if (hash) {
    params.set("hash", hash);
  }

  // Add block number if available
  if (blockHeight) {
    params.set("block", String(blockHeight));
  }

  // Pass through RIP parameter if present
  if (qp.rip === "true" || qp.rip === "1") {
    params.set("rip", "true");
  }

  return {
    statusCode: 302,
    headers: {
      Location: `/.netlify/functions/proof_pdf?${params.toString()}`,
      "Cache-Control": "no-store",
    },
    body: "",
  };
};
