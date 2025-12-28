// netlify/functions/resolve_now.mjs
// Manually upgrade an OTS receipt via the sidecar and persist anchor JSON.
// PLUS: if ANCHORED, send a post-anchor email (idempotent).
//
// Usage:
//   /.netlify/functions/resolve_now?id=<proofId>

import { createRequire } from "module";
const require = createRequire(import.meta.url);

let _storePromise = null;

// Minimal, robust store getter mirroring _db.js behavior.
async function getStoreSafe() {
  if (_storePromise) return _storePromise;

  _storePromise = (async () => {
    try {
      const mod = await import("@netlify/blobs");

      // First: try automatic environment binding (same as _db.js)
      try {
        return mod.getStore("proofs");
      } catch {
        // Fallback: manual configuration if needed
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
          if (mod.BlobsClient) {
            const client = new mod.BlobsClient({ siteID, token });
            return client.getStore("proofs");
          }
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

export const handler = async (event) => {
  try {
    if (event.httpMethod !== "GET") {
      return json(405, { ok: false, error: "GET required" });
    }

    const id = (event.queryStringParameters?.id || "").trim();
    if (!id) {
      return json(400, { ok: false, error: "missing id" });
    }

    const sidecarBase = (process.env.OTS_SIDECAR_URL || "").replace(/\/+$/, "");
    if (!sidecarBase) {
      return json(500, { ok: false, error: "OTS_SIDECAR_URL not configured" });
    }

    const store = await getStoreSafe();
    if (!store) {
      return json(500, {
        ok: false,
        error: "Blobs store 'proofs' not available from this function",
      });
    }

    const receiptKey = `ots/receipts/${id}.ots`;

    // 1) Load the .ots receipt exactly where _db.setOtsReceipt wrote it
    let ab;
    try {
      ab = await store.get(receiptKey, { type: "arrayBuffer" });
    } catch (e) {
      return json(500, {
        ok: false,
        error: "error reading receipt from blobs",
        detail: String(e?.message || e),
        id,
        receiptKey,
      });
    }

    if (!ab || !ab.byteLength) {
      return json(404, {
        ok: false,
        error: "receipt not found in blobs",
        id,
        receiptKey,
      });
    }

    const receiptB64 = Buffer.from(ab).toString("base64");

    // 2) Call sidecar /upgrade
    const upgradeResp = await fetch(`${sidecarBase}/upgrade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, receipt_b64: receiptB64 }),
    });

    if (!upgradeResp.ok) {
      const text = await upgradeResp.text().catch(() => "");
      return json(502, {
        ok: false,
        error: "OTS sidecar /upgrade failed",
        status: upgradeResp.status,
        detail: text,
        id,
      });
    }

    const upgrade = await upgradeResp.json().catch(() => ({}));

    if (!upgrade || upgrade.ok !== true || !upgrade.receipt_b64) {
      return json(502, {
        ok: false,
        error: "Invalid response from OTS sidecar /upgrade",
        raw: upgrade,
        id,
      });
    }

    const state = upgrade.state || "OTS_RECEIPT";
    const txid = upgrade.txid || null;

    // 3) Persist upgraded receipt back into the same store
    try {
      const upgradedBytes = Buffer.from(upgrade.receipt_b64, "base64");
      await store.set(receiptKey, upgradedBytes, {
        contentType: "application/octet-stream",
      });
    } catch (e) {
      console.error("resolve_now: failed to persist upgraded receipt:", e);
      // Non-fatal.
    }

    // 4) Write anchor JSON so anchor_status can see it
    const anchorKey = `anchor:${id}.json`;
    const anchorDoc = {
      id,
      state,
      txid,
      confirmations: 0,
      updatedAt: new Date().toISOString(),
      source: "resolve_now",
    };

    try {
      await store.set(anchorKey, JSON.stringify(anchorDoc), {
        contentType: "application/json",
      });
    } catch (e) {
      return json(500, {
        ok: false,
        error: "failed to persist anchor JSON",
        detail: String(e?.message || e),
        id,
        anchorKey,
        state,
        txid,
      });
    }

    // 5) POST-ANCHOR EMAIL (idempotent)
    // Only email when ANCHORED with txid, and only once per proof id.
    let emailedAnchor = false;
    if (state === "ANCHORED" && txid) {
      try {
        const { getProof, saveProof } = require("./_db");
        const { sendEmail } = require("./_email");

        const proof = await getProof(id).catch(() => null);

        // Need a proof record with an email, and must not have already sent anchor email
        if (proof && proof.customerEmail && !proof.anchorEmailSentAt) {
          const origin = (process.env.URL || "https://docuproof.io").replace(/\/$/, "");
          const verifyUrl = `${origin}/v/${encodeURIComponent(id)}`;
          const mempoolUrl = `https://mempool.space/tx/${encodeURIComponent(txid)}`;

          // Mark first (so any retry never double-sends)
          const markTime = new Date().toISOString();
          const anchorEmailCount =
            typeof proof.anchorEmailCount === "number" ? proof.anchorEmailCount + 1 : 1;

          await saveProof({
            ...proof,
            id, // ensure canonical id key stays the same
            anchorEmailSentAt: markTime,
            anchorEmailCount,
            source: proof.source || "resolve_now",
          }).catch(() => {});

          // Send email (best-effort)
          await sendEmail({
            to: proof.customerEmail,
            subject: `docuProof anchored on Bitcoin: ${proof.displayName || "Your proof"}`,
            htmlBody: `
              <p>Your docuProof has been <strong>anchored on Bitcoin</strong>.</p>
              <p><strong>Proof ID:</strong> <code>${id}</code></p>
              <p><strong>Bitcoin txid:</strong> <code>${txid}</code></p>
              <p>Explorer: <a href="${mempoolUrl}">${mempoolUrl}</a></p>
              <p>Verify: <a href="${verifyUrl}">${verifyUrl}</a></p>
            `,
            textBody:
              `Your docuProof has been anchored on Bitcoin.\n\n` +
              `Proof ID: ${id}\n` +
              `Bitcoin txid: ${txid}\n` +
              `Explorer: ${mempoolUrl}\n` +
              `Verify: ${verifyUrl}\n`,
            attachments: [],
          });

          emailedAnchor = true;
        }
      } catch (e) {
        console.error("resolve_now: anchor email error (non-fatal):", e);
        // Non-fatal; anchoring already persisted.
      }
    }

    return json(200, {
      ok: true,
      id,
      anchorKey,
      state,
      txid,
      emailedAnchor,
    });
  } catch (e) {
    console.error("resolve_now error:", e);
    return json(500, {
      ok: false,
      error: "internal error in resolve_now",
      detail: String(e?.message || e),
    });
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