// netlify/functions/download_receipt.mjs
// ESM. Streams the OTS receipt as a binary download.
// Looks up canonical then legacy key. 404 if neither exists.

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

function respBinaryOK(filename, buf) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Transfer-Encoding': 'binary',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
    isBase64Encoded: true,
    body: buf.toString('base64'),
  };
}

function respJSON(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  try {
    const id = (event.queryStringParameters && event.queryStringParameters.id) || '';
    if (!id) return respJSON(400, { error: 'missing id' });

    const store = await getStore();

    const keys = [
      `ots/receipts/${id}.ots`, // canonical
      `ots:${id}.receipt`,      // legacy
    ];

    let bytes = null;
    for (const k of keys) {
      const ab = await store.get(k, { type: 'arrayBuffer' });
      if (ab) { bytes = Buffer.from(ab); break; }
    }

    if (!bytes) {
      return respJSON(404, { error: 'receipt not found', id, tried: keys });
    }

    return respBinaryOK(`${id}.ots`, bytes);
  } catch (e) {
    console.error('download_receipt error:', e);
    return respJSON(500, { error: e.message });
  }
};