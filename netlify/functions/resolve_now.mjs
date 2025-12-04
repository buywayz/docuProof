// netlify/functions/resolve_now.mjs
// Manually upgrade an OTS receipt via the sidecar and persist anchor JSON.
//
// Usage:
//   /.netlify/functions/resolve_now?id=<proofId>

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

    const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
    const token  = (process.env.NETLIFY_BLOBS_TOKEN || "").trim();
    const primary = (process.env.BLOBS_STORE_NAME || "proofs").trim();

    if (!siteID || !token) {
      return json(500, {
        ok: false,
        error: "Blobs not configured (missing NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN)",
      });
    }

    const { getStore } = await import("@netlify/blobs");
    const store = getStore({ name: primary, siteID, token });

    // 1) Load the .ots receipt
    const receiptKey = `ots/receipts/${id}.ots`;
    const ab = await store.get(receiptKey, { type: "arrayBuffer" });

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
      });
    }

    const upgrade = await upgradeResp.json().catch(() => ({}));

    if (!upgrade || upgrade.ok !== true || !upgrade.receipt_b64) {
      return json(502, {
        ok: false,
        error: "Invalid response from OTS sidecar /upgrade",
        raw: upgrade,
      });
    }

    const state = upgrade.state || "OTS_RECEIPT";
    const txid  = upgrade.txid || null;

    // 3) Persist the upgraded receipt back into blobs
    try {
      const upgradedBytes = Buffer.from(upgrade.receipt_b64, "base64");
      await store.set(receiptKey, upgradedBytes, {
        contentType: "application/octet-stream",
      });
    } catch (e) {
      // Non-fatal; we still write the anchor JSON
      console.error("resolve_now: failed to persist upgraded receipt:", e);
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

    await store.set(anchorKey, JSON.stringify(anchorDoc), {
      contentType: "application/json",
    });

    return json(200, {
      ok: true,
      id,
      anchorKey,
      state,
      txid,
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
