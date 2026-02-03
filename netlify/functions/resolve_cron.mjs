// netlify/functions/resolve_cron.mjs
// v2.0.0 - Fixed: correct store, proper anchor scanning, writes blockHeight + state
// Scheduled hourly via netlify.toml: [functions."resolve_cron"] schedule = "@hourly"
//
// Flow:
// 1. List all keys matching "anchor:*.json" in the "proofs" store
// 2. For each that is NOT yet "ANCHORED", load the .ots receipt
// 3. Call OTS sidecar /upgrade to check if Bitcoin has confirmed it
// 4. If upgraded, persist blockHeight, state="ANCHORED", and updated receipt

const OTS_SIDECAR_URL = process.env.OTS_SIDECAR_URL;
const BATCH_LIMIT = 40;

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function getStore() {
  const mod = await import("@netlify/blobs");
  const gs = mod.getStore || (mod.default && mod.default.getStore);
  if (!gs) throw new Error("getStore not available from @netlify/blobs");

  // Try automatic binding first (works in Netlify runtime)
  try {
    return gs("proofs");
  } catch (e) {
    // Manual fallback
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
    if (!siteID || !token) {
      throw new Error("Netlify Blobs not bound and manual credentials missing");
    }
    return gs({ name: "proofs", siteID, token });
  }
}

export const handler = async (_event) => {
  try {
    if (!OTS_SIDECAR_URL) {
      return json(500, { ok: false, error: "OTS_SIDECAR_URL not configured" });
    }

    const store = await getStore();

    // ─── Step 1: Find all pending anchors ───────────────────────────────
    // List all blobs and filter for anchor:*.json keys
    let anchorKeys = [];
    try {
      const list = await store.list({ prefix: "anchor:" });
      if (list && list.blobs) {
        anchorKeys = list.blobs
          .map((b) => b.key || b.name || b)
          .filter((k) => typeof k === "string" && k.endsWith(".json"));
      }
    } catch (listErr) {
      console.error("resolve_cron: failed to list anchor keys:", listErr);
      return json(500, { ok: false, error: "Failed to list anchor keys", detail: String(listErr) });
    }

    if (anchorKeys.length === 0) {
      return json(200, { ok: true, processed: 0, note: "no anchor records found" });
    }

    // ─── Step 2: Process each pending anchor ────────────────────────────
    const batch = anchorKeys.slice(0, BATCH_LIMIT);
    let processed = 0;
    let skipped = 0;
    let upgraded = 0;
    let errors = 0;

    for (const anchorKey of batch) {
      try {
        // Read anchor status
        const raw = await store.get(anchorKey, { type: "text" });
        if (!raw) { processed++; continue; }

        let anchor;
        try {
          anchor = JSON.parse(raw);
        } catch {
          processed++;
          continue;
        }

        // Skip if already anchored with blockHeight
        if (anchor.state === "ANCHORED" && anchor.blockHeight && anchor.blockHeight > 0) {
          skipped++;
          processed++;
          continue;
        }

        // Extract proof ID from key: "anchor:PROOFID.json"
        const id = anchorKey.replace(/^anchor:/, "").replace(/\.json$/, "");
        if (!id) { processed++; continue; }

        // ─── Step 3: Load the .ots receipt ────────────────────────────
        const receiptCandidates = [
          `ots/receipts/${id}.ots`,
          `ots:${id}.receipt`,
        ];

        let receiptBytes = null;
        for (const rk of receiptCandidates) {
          try {
            const ab = await store.get(rk, { type: "arrayBuffer" });
            if (ab && ab.byteLength > 0) {
              receiptBytes = Buffer.from(ab);
              break;
            }
          } catch {}
        }

        if (!receiptBytes) {
          // No receipt found - can't upgrade
          processed++;
          continue;
        }

        const receiptB64 = receiptBytes.toString("base64");

        // ─── Step 4: Call sidecar /upgrade ────────────────────────────
        let upgradeResult = null;
        try {
          const resp = await fetch(`${OTS_SIDECAR_URL}/upgrade`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, receipt_b64: receiptB64 }),
          });

          if (resp.ok) {
            upgradeResult = await resp.json();
          } else {
            const text = await resp.text().catch(() => "");
            console.error(`resolve_cron: /upgrade failed for ${id}: ${resp.status} ${text}`);
          }
        } catch (fetchErr) {
          console.error(`resolve_cron: /upgrade fetch error for ${id}:`, fetchErr);
        }

        if (!upgradeResult || !upgradeResult.ok) {
          processed++;
          continue;
        }

        // ─── Step 5: Update anchor record ─────────────────────────────
        const newState = upgradeResult.state || "OTS_RECEIPT";
        const txid = upgradeResult.txid || null;
        const blockHeight = upgradeResult.blockHeight || upgradeResult.block_height || upgradeResult.block || null;
        const confirmations = upgradeResult.confirmations || 0;

        let changed = false;

        // Check if we got a Bitcoin confirmation
        if (newState === "ANCHORED" || blockHeight || txid) {
          anchor.state = "ANCHORED";
          anchor.txid = txid || anchor.txid || null;
          anchor.blockHeight = blockHeight || anchor.blockHeight || null;
          anchor.confirmations = confirmations || anchor.confirmations || 0;
          changed = true;
        } else if (newState !== anchor.state) {
          anchor.state = newState;
          changed = true;
        }

        // Always try to save the upgraded receipt
        if (upgradeResult.receipt_b64) {
          try {
            const upgradedBytes = Buffer.from(upgradeResult.receipt_b64, "base64");
            await store.set(`ots/receipts/${id}.ots`, upgradedBytes, {
              contentType: "application/octet-stream",
            });
          } catch (e) {
            console.error(`resolve_cron: failed to save upgraded receipt for ${id}:`, e);
          }
        }

        if (changed) {
          anchor.updatedAt = new Date().toISOString();
          anchor.resolvedBy = "resolve_cron";
          await store.set(anchorKey, JSON.stringify(anchor), {
            contentType: "application/json",
          });
          upgraded++;
          console.log(`resolve_cron: upgraded ${id} → state=${anchor.state}, block=${anchor.blockHeight}`);
        }

        processed++;
      } catch (itemErr) {
        console.error(`resolve_cron: error processing ${anchorKey}:`, itemErr);
        errors++;
        processed++;
      }
    }

    return json(200, {
      ok: true,
      processed,
      upgraded,
      skipped,
      errors,
      total: anchorKeys.length,
      batch: batch.length,
    });
  } catch (e) {
    console.error("resolve_cron error:", e);
    return json(500, { ok: false, error: e.message });
  }
};
