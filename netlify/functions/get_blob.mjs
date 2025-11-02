// netlify/functions/get_blob.mjs
// Returns whether a key exists, its byte length, and which store it was found in.

import { json, makeBlobHelpers } from "./_blobs_helper.mjs";

export const handler = async (event) => {
  try {
    const { key } = Object.fromEntries(new URLSearchParams(event.queryStringParameters || {}));
    if (!key) return json(400, { ok: false, error: "missing ?key=" });

    const h = await makeBlobHelpers();
    const { bytes, storeName } = await h.getBytesEx(key);

    return json(200, {
      ok: !!bytes,
      key,
      authPath: h.authPath,
      foundInStore: storeName,
      bytes: bytes ? bytes.length : 0,
      primaryStore: h.PRIMARY_STORE,
      probedStores: h.READ_STORES,
    });
  } catch (e) {
    return json(500, { ok: false, error: e.message });
  }
};