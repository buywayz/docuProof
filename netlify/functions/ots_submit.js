// netlify/functions/ots_submit.js
// v2.0.0 - FIXED: Updates anchor status to OTS_RECEIPT after storing receipt
// Previously only stored the .ots receipt but left anchor JSON as bare PENDING

const { setOtsReceipt } = require('./_db');

const OTS_SIDECAR_URL = process.env.OTS_SIDECAR_URL;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, error: 'Invalid JSON body' })
    };
  }

  const { id, hash } = payload;

  if (!id || typeof id !== 'string' || !id.trim()) {
    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, error: 'Missing or invalid id' })
    };
  }

  if (!hash || typeof hash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hash)) {
    return {
      statusCode: 400,
      body: JSON.stringify({ ok: false, error: 'Missing or invalid hash' })
    };
  }

  if (!OTS_SIDECAR_URL) {
    console.error('OTS_SIDECAR_URL not configured');
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'OTS sidecar URL not configured' })
    };
  }

  try {
    // 1. Call the sidecar /stamp-hash
    const resp = await fetch(`${OTS_SIDECAR_URL}/stamp-hash`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, hash })
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('OTS sidecar error:', resp.status, text);
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok: false,
          error: 'OTS sidecar error',
          detail: text
        })
      };
    }

    const json = await resp.json();

    if (!json.ok || !json.receipt_b64) {
      console.error('Unexpected OTS sidecar response:', json);
      return {
        statusCode: 502,
        body: JSON.stringify({
          ok: false,
          error: 'Invalid response from OTS sidecar'
        })
      };
    }

    // 2. Decode base64 and write .ots receipt into Netlify Blobs
    const bytes = Buffer.from(json.receipt_b64, 'base64');
    await setOtsReceipt(id, bytes);
    console.log(`[ots_submit] Receipt stored for ${id} (${bytes.length} bytes)`);

    // 3. UPDATE anchor status JSON to OTS_RECEIPT so anchor_status reflects reality
    try {
      const mod = await import("@netlify/blobs");
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;

      let store;
      if (siteID && token) {
        store = mod.getStore({ name: "proofs", siteID, token });
      } else {
        store = mod.getStore("proofs");
      }

      const anchorKey = `anchor:${id}.json`;

      // Read existing anchor doc to preserve fields like createdAt
      let existing = {};
      try {
        const raw = await store.get(anchorKey, { type: "text" });
        if (raw) existing = JSON.parse(raw);
      } catch {}

      const updated = {
        ...existing,
        id,
        state: "OTS_RECEIPT",
        hash: hash.toLowerCase(),
        receiptStored: true,
        receiptBytes: bytes.length,
        updatedAt: new Date().toISOString(),
      };

      await store.set(anchorKey, JSON.stringify(updated), {
        contentType: "application/json",
      });
      console.log(`[ots_submit] Anchor status updated to OTS_RECEIPT for ${id}`);
    } catch (anchorErr) {
      // Non-fatal: receipt is stored, resolve_cron/resolve_now will catch up
      console.error(`[ots_submit] Failed to update anchor status for ${id}:`, anchorErr);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  } catch (err) {
    console.error('ots_submit error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: 'Internal error during OTS submit',
        detail: String(err)
      })
    };
  }
};
