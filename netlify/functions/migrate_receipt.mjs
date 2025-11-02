// netlify/functions/migrate_receipt.mjs
// Copy an existing receipt + anchor (wherever they currently live) into the primary store.
// Usage:
//   /.netlify/functions/migrate_receipt?id=cs_test_email012
//   /.netlify/functions/migrate_receipt?id=cs_test_email012&dry=1  (no writes, just report)

export const handler = async (event) => {
  try {
    const id = (event.queryStringParameters?.id || "").trim();
    const dry = (event.queryStringParameters?.dry || "") === "1";
    if (!id) return json(400, { ok: false, error: "missing ?id=" });

    const siteID = (process.env.NETLIFY_SITE_ID || "").trim();
    const token  = (process.env.NETLIFY_BLOBS_TOKEN || "").trim();
    const targetName = (process.env.BLOBS_STORE_NAME || "docuproof").trim();

    const { getStore } = await import("@netlify/blobs");

    // Discovery list (same order you saw in verify output)
    const STORES = [
      targetName,
      "docuproof",
      "ots",
      "default",
      "blobs",
      "public",
    ].filter(Boolean);

    const keys = [
      `ots/receipts/${id}.ots`,
      `ots:${id}.receipt`,
      `anchor:${id}.json`,
    ];

    const probe = {};
    const found = {};
    for (const key of keys) {
      for (const name of STORES) {
        const store = getStore({ name, siteID, token });
        const ab = await safeGet(store, key, "arrayBuffer");
        if (ab) {
          probe[key] ||= {};
          probe[key][name] = { ok: true, bytes: ab.byteLength, kind: "Bytes" };
          found[key] = { store: name, ab };
          break;
        } else {
          probe[key] ||= {};
          probe[key][name] = { ok: false, bytes: 0 };
        }
      }
    }

    // If nothing was found at all:
    const anyFound = Object.keys(found).length > 0;
    if (!anyFound) {
      return json(200, {
        ok: false,
        id,
        note: "No receipt/anchor objects found in any store.",
        targetStore: targetName,
        probe,
      });
    }

    // Write into target store (unless dry-run)
    const target = getStore({ name: targetName, siteID, token });
    const writes = [];

    for (const key of keys) {
      const hit = found[key];
      if (!hit) continue; // not found anywhere
      if (hit.store === targetName) {
        writes.push({ key, action: "skip (already in target)", bytes: hit.ab.byteLength });
        continue;
        }
      if (dry) {
        writes.push({ key, action: "would-copy", from: hit.store, to: targetName, bytes: hit.ab.byteLength });
      } else {
        await target.set(key, hit.ab); // write raw bytes
        writes.push({ key, action: "copied", from: hit.store, to: targetName, bytes: hit.ab.byteLength });
      }
    }

    return json(200, {
      ok: true,
      id,
      dryRun: dry,
      targetStore: targetName,
      writes,
      probe,
    });
  } catch (e) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
};

async function safeGet(store, key, type) {
  try {
    return await store.get(key, { type }); // "arrayBuffer"
  } catch (_) {
    return null;
  }
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: JSON.stringify(body),
  };
}