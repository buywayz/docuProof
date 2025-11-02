// netlify/functions/blobs_diag.mjs
// Probes Netlify Blobs auth paths and returns per-path results.

const SITE_ID = (process.env.NETLIFY_SITE_ID || '').trim();
const FUNCTIONS_TOKEN = (process.env.NETLIFY_FUNCTIONS_TOKEN || '').trim();
const BLOBS_TOKEN = (process.env.NETLIFY_BLOBS_TOKEN || '').trim();

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body, null, 2),
  };
}

async function loadBlobs() {
  return import('@netlify/blobs'); // ESM entry
}

async function tryPath(label, opts) {
  const out = { path: label, ok: false };
  try {
    const mod = await loadBlobs();
    const getStore = mod.getStore || (mod.default && mod.default.getStore);
    if (!getStore) throw new Error('getStore not available from @netlify/blobs');

    // opts may be: null (default binding) or { name, siteID, token }
    const store = opts ? await getStore(opts) : await getStore('default');

    // write then read small payload
    const key = 'diag/ping.txt';
    const payload = Buffer.from(`ok ${new Date().toISOString()}`, 'utf8');
    await store.set(key, payload, { contentType: 'text/plain; charset=utf-8' });

    const got = await store.get(key, { type: 'arrayBuffer' });
    if (!got) throw new Error('read returned null/undefined');
    const text = Buffer.from(got).toString('utf8');

    out.ok = true;
    out.details = { wrote: payload.length, read: got.byteLength, text: text.slice(0, 40) };
  } catch (e) {
    // If the SDK throws an HTTP error, surface the status; otherwise the message
    out.error = e && (e.response?.status ? `HTTP ${e.response.status}` : (e.message || String(e)));
  }
  return out;
}

export const handler = async () => {
  const sitePrefix = SITE_ID ? (SITE_ID.slice(0, 8) + '…') : '(none)';
  const tokenSumm = (t) => (t ? `${t.slice(0, 4)}… (${t.length})` : '(none)');

  const results = [];
  // 1) default binding (no credentials)
  results.push(await tryPath('default-binding', null));

  // 2) functions token
  if (SITE_ID && FUNCTIONS_TOKEN) {
    results.push(
      await tryPath('manual-functions-token', { name: 'default', siteID: SITE_ID, token: FUNCTIONS_TOKEN })
    );
  } else {
    results.push({ path: 'manual-functions-token', ok: false, error: 'SITE_ID or FUNCTIONS_TOKEN missing' });
  }

  // 3) blobs token
  if (SITE_ID && BLOBS_TOKEN) {
    results.push(
      await tryPath('manual-blobs-token', { name: 'default', siteID: SITE_ID, token: BLOBS_TOKEN })
    );
  } else {
    results.push({ path: 'manual-blobs-token', ok: false, error: 'SITE_ID or BLOBS_TOKEN missing' });
  }

  return json(200, {
    env_seen: {
      SITE_ID: sitePrefix,
      FUNCTIONS_TOKEN_prefix_len: tokenSumm(FUNCTIONS_TOKEN),
      BLOBS_TOKEN_prefix_len: tokenSumm(BLOBS_TOKEN),
    },
    results,
    hint: 'At least one path must be ok:true. If all fail with HTTP 401, the token lacks Blobs data-plane access.'
  });
};