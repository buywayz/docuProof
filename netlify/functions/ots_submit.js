const OTS_SIDECAR_URL = process.env.OTS_SIDECAR_URL;

// Robust loader that works whether _db.js is CommonJS or ESM
async function getProofStore() {
  const mod = await import('./_db.js'); // Netlify bundler resolves this
  const db = mod.default || mod;

  // Try common patterns
  if (typeof db.getStore === 'function') return db.getStore();
  if (typeof db.getProofStore === 'function') return db.getProofStore();

  throw new Error('No getStore/getProofStore function exported from _db.js');
}

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
    // Call the sidecar /stamp-hash
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

    // Decode base64 and write .ots into Netlify Blobs
    const bytes = Buffer.from(json.receipt_b64, 'base64');
    const store = await getProofStore();
    const key = `ots/receipts/${id}.ots`;

    await store.set(key, bytes);

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
