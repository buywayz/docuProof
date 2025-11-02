// netlify/functions/ots_submit_real.mjs
// ESM; manual Blobs binding using NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN.
// Guarantees: always writes anchor status JSON; writes receipt when present; fails loudly if nothing written.

const OTS_SIDECAR_URL = process.env.OTS_SIDECAR_URL; // e.g. https://…run.app
const FROM_EMAIL = process.env.FROM_EMAIL || 'docuProof <no-reply@docuproof.io>';
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN;

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
function safeParse(s) { try { return JSON.parse(s || '{}'); } catch { return {}; } }
function escapeHtml(str) {
  return String(str)
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

// ---- Blobs binding (manual, stable) ----
async function getStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
  if (!siteID || !token) throw new Error('Missing NETLIFY_SITE_ID or NETLIFY_BLOBS_TOKEN');
  const mod = await import('@netlify/blobs');
  const gs = mod.getStore || (mod.default && mod.default.getStore);
  if (!gs) throw new Error('getStore not exported by @netlify/blobs');
  return gs({ name: 'default', siteID, token });
}
async function makeBlobHelpers() {
  const store = await getStore();
  const getBytes = async (key) => {
    const ab = await store.get(key, { type: 'arrayBuffer' });
    return ab ? Buffer.from(ab) : null;
  };
  const setBytes = async (key, bytes) => {
    await store.set(key, bytes, { metadata: { contentType: 'application/octet-stream' } });
  };
  const getJson = async (key, fallback=null) => {
    const ab = await store.get(key, { type: 'arrayBuffer' });
    if (!ab) return fallback;
    try { return JSON.parse(Buffer.from(ab).toString('utf8')); } catch { return fallback; }
  };
  const setJson = async (key, obj) => {
    await store.set(key, JSON.stringify(obj), { metadata: { contentType: 'application/json; charset=utf-8' } });
  };
  return { getBytes, setBytes, getJson, setJson };
}

// ---- Sidecar helpers ----
async function sidecarSubmit(hash) {
  if (!OTS_SIDECAR_URL) throw new Error('OTS_SIDECAR_URL not configured');
  const r = await fetch(`${OTS_SIDECAR_URL}/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hash }),
  });
  if (!r.ok) throw new Error(`Sidecar submit failed: ${r.status}`);
  // Expect either {ok:true, receipt_b64?...} or {status, receiptBase64?...}
  const j = await r.json();
  return j;
}
async function sidecarTxidFromReceipt(receiptBase64) {
  if (!OTS_SIDECAR_URL) throw new Error('OTS_SIDECAR_URL not configured');
  const attempts = [
    `${OTS_SIDECAR_URL}/txid-from-receipt`,
    `${OTS_SIDECAR_URL}/txid`,
    `${OTS_SIDECAR_URL}/verify`,
  ];
  for (const url of attempts) {
    try {
      const r = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiptBase64 }),
      });
      if (!r.ok) continue;
      const j = await r.json();
      return {
        txid: j.txid || null,
        confirmations: Number.isFinite(j.confirmations) ? j.confirmations : null,
      };
    } catch { /* next */ }
  }
  return { txid: null, confirmations: null };
}

// ---- Email (Postmark) ----
async function sendPostmarkEmail({ to, subject, htmlBody, attachments = [] }) {
  if (!POSTMARK_SERVER_TOKEN) {
    console.warn('POSTMARK_SERVER_TOKEN not set; skipping email.');
    return { skipped: true };
  }
  const r = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ From: FROM_EMAIL, To: to, Subject: subject, HtmlBody: htmlBody, Attachments: attachments }),
  });
  if (!r.ok) throw new Error(`Postmark error ${r.status}: ${await r.text()}`);
  return r.json();
}

// ---- Main handler ----
export const handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

    const { id, hash, email: emailOverride, displayName: displayNameOverride } = safeParse(event.body);
    if (!id || !hash) return json(400, { error: 'Missing id or hash' });

    const { getBytes, setBytes, getJson, setJson } = await makeBlobHelpers();

    const anchorKey = `anchor:${id}.json`;
    const receiptCanonical = `ots/receipts/${id}.ots`;
    const receiptLegacy    = `ots:${id}.receipt`;

    // Load existing status (if present)
    const current = (await getJson(anchorKey, null)) || { id, state: 'NEW', txid: null, confirmations: 0 };

    const email = emailOverride || current.email || null;
    const displayName = displayNameOverride || current.displayName || null;

    // Submit to sidecar, try to get a fresh receipt
    let rcvdReceiptB64 = null;
    let sidecarResp = null;
    try {
      sidecarResp = await sidecarSubmit(hash);
      rcvdReceiptB64 = sidecarResp.receipt_b64 || sidecarResp.receiptBase64 || null;
    } catch (e) {
      console.warn('sidecar submit error (non-fatal):', e?.message || e);
    }

    // Persist receipt if returned
    let wroteReceipt = false;
    if (rcvdReceiptB64) {
      const bytes = Buffer.from(rcvdReceiptB64, 'base64');
      await setBytes(receiptCanonical, bytes);
      await setBytes(receiptLegacy,    bytes);
      wroteReceipt = true;
    } else {
      // No new receipt — keep any existing as-is
      const existing = (await getBytes(receiptCanonical)) || (await getBytes(receiptLegacy));
      if (existing) wroteReceipt = true;
    }

    // Update anchor status to OTS_RECEIPT at minimum
    const nextStatus = {
      id,
      state: 'OTS_RECEIPT',
      txid: current.txid || null,
      confirmations: Number.isFinite(current.confirmations) ? current.confirmations : 0,
      email: email || null,
      displayName: displayName || null,
      receipt_ref: wroteReceipt ? receiptCanonical : null,
      lastUpdateAt: new Date().toISOString(),
      authPath: 'manual-blobs-token',
    };
    await setJson(anchorKey, nextStatus);

    // Try to resolve txid if we have a receipt
    if (wroteReceipt) {
      try {
        const rb = (await getBytes(receiptCanonical)) || (await getBytes(receiptLegacy));
        if (rb) {
          const { txid, confirmations } = await sidecarTxidFromReceipt(Buffer.from(rb).toString('base64'));
          if (txid) {
            nextStatus.txid = txid;
            if (Number.isFinite(confirmations)) nextStatus.confirmations = confirmations;
            nextStatus.lastResolvedAt = new Date().toISOString();
            await setJson(anchorKey, nextStatus);
          }
        }
      } catch (e) {
        console.warn('txid resolve attempt failed (non-fatal):', e?.message || e);
      }
    }

    // Email the receipt (if we have both email and receipt)
    if (email && wroteReceipt) {
      const verifyUrl = `https://docuproof.io/.netlify/functions/verify_page?id=${encodeURIComponent(id)}`;
      const anchorApi = `https://docuproof.io/.netlify/functions/anchor_status?id=${encodeURIComponent(id)}`;
      const btcExplorer = nextStatus.txid ? `https://mempool.space/tx/${encodeURIComponent(nextStatus.txid)}` : null;

      const attach = (await getBytes(receiptCanonical)) || (await getBytes(receiptLegacy));
      if (attach) {
        const htmlBody = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial">
            <h2 style="margin:0 0 12px">Your OpenTimestamps receipt</h2>
            ${displayName ? `<p><strong>Title:</strong> ${escapeHtml(displayName)}</p>` : ''}
            <p><strong>Proof ID:</strong> ${escapeHtml(id)}</p>
            <p><strong>Hash:</strong> <code>${escapeHtml(hash)}</code></p>
            <p><strong>Current state:</strong> ${escapeHtml(nextStatus.state)}${btcExplorer ? ` &middot; <a href="${btcExplorer}">Bitcoin tx</a>` : ''}</p>
            <p>Receipt attached (<code>${escapeHtml(`${id}.ots`)}</code>). Verify any time:</p>
            <ul>
              <li><a href="${verifyUrl}">Verify page</a></li>
              <li><a href="${anchorApi}">Anchor status (API)</a></li>
            </ul>
            <p style="color:#666">Keep this .ots with your original document. Independent verification: <code>ots verify yourfile.pdf.ots</code></p>
          </div>`;
        try {
          await sendPostmarkEmail({
            to: email,
            subject: `docuProof — Your OTS Receipt (${id})`,
            htmlBody,
            attachments: [{ Name: `${id}.ots`, Content: attach.toString('base64'), ContentType: 'application/octet-stream' }],
          });
        } catch (e) {
          console.warn('email send failed (non-fatal):', e?.message || e);
        }
      }
    }

    // If we still have no receipt written at all, *fail loudly* so we can detect (this was the 012 case)
    if (!wroteReceipt) {
      return json(502, {
        error: 'No receipt available yet (sidecar returned none and no prior receipt found).',
        id,
        state: nextStatus.state,
        anchorKey,
        note: 'Try again later or re-run after sidecar is healthy.',
      });
    }

    return json(200, {
      ok: true,
      id,
      state: nextStatus.state,
      txid: nextStatus.txid || null,
      confirmations: nextStatus.confirmations || 0,
      receiptRef: nextStatus.receipt_ref,
      anchorKey,
      receiptKey: receiptLegacy,
      authPath: 'manual-blobs-token',
    });
  } catch (e) {
    console.error('ots_submit_real error:', e);
    return json(500, { error: e.message });
  }
};