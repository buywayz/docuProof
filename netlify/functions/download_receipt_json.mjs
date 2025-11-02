// netlify/functions/download_receipt_json.mjs
// ESM. Returns JSON: { filename, base64 } for the OTS receipt.
// Looks up canonical then legacy key. 404 if neither exists.

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

async function getStore() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token =
    process.env.NETLIFY_BLOBS_TOKEN ||
    process.env.NETLIFY_API_TOKEN;

  if (!siteID || !token)
    throw new Error('Missing NETLIFY_SITE_ID and/or NETLIFY_*_TOKEN');

  const mod = await import('@netlify/blobs');
  const getStore = mod.getStore || (mod.default && mod.default.getStore);
  if (!getStore) throw new Error('getStore not exported by @netlify/blobs');
  return getStore({ name: 'default', siteID, token });
}

export const handler = async (event) => {
  try {
    const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    if (!id) return json(400, { error: 'missing id' });

    const store = await getStore();

    const keys = [
      `ots/receipts/${id}.ots`, // canonical
      `ots:${id}.receipt`,      // legacy
    ];

    let bytes = null;
    let picked = null;

    for (const k of keys) {
      const ab = await store.get(k, { type: 'arrayBuffer' });
      if (ab) {
        bytes = Buffer.from(ab);
        picked = k;
        break;
      }
    }

    if (!bytes) {
      return json(404, { error: 'receipt not found', id, tried: keys });
    }

    return json(200, {
      filename: `${id}.ots`,
      key: picked,
      base64: bytes.toString('base64'),
    });
  } catch (e) {
    console.error('download_receipt_json error:', e);
    return json(500, { error: e.message });
  }
};