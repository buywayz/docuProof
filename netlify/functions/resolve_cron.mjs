// netlify/functions/resolve_cron.mjs
// Scheduled resolver: walk a small index of recent IDs and backfill txid/confirmations.
// ESM, no top-level await.

const OTS_SIDECAR_URL   = process.env.OTS_SIDECAR_URL;
const NETLIFY_SITE_ID   = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
const NETLIFY_API_TOKEN = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
const BATCH_LIMIT = 40; // scan up to N ids per run

function json(status, body){
  return { statusCode: status, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function getStore(){
  const mod = await import("@netlify/blobs");
  const gs = mod.getStore || (mod.default && mod.default.getStore);
  if(!gs) throw new Error("getStore not available from @netlify/blobs");
  try {
    return gs("default");
  } catch(e){
    const msg = e?.message || "";
    if(!/not been configured|requires the name of the store|is not configured/i.test(msg)) throw e;
    if(!NETLIFY_SITE_ID || !NETLIFY_API_TOKEN) throw new Error("Netlify Blobs not bound and manual credentials missing. Set NETLIFY_SITE_ID and NETLIFY_API_TOKEN.");
    return gs({ name:"default", siteID: NETLIFY_SITE_ID, token: NETLIFY_API_TOKEN });
  }
}

async function sidecarTxidFromReceipt(receiptBase64){
  if(!OTS_SIDECAR_URL) throw new Error("OTS_SIDECAR_URL not configured");
  const tries = ["txid-from-receipt","txid","verify"].map(p => `${OTS_SIDECAR_URL}/${p}`);
  for(const url of tries){
    try{
      const r = await fetch(url, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ receiptBase64 })
      });
      if(!r.ok) continue;
      const j = await r.json();
      return { txid: j.txid || null, confirmations: Number(j.confirmations) || 0 };
    }catch{}
  }
  return { txid:null, confirmations:0 };
}

export const handler = async (_event)=>{
  try{
    const store = await getStore();

    // Load index of recent IDs
    const idxKey = "anchors/index.json";
    const idxRaw = await store.get(idxKey, { type:"arrayBuffer" });
    if(!idxRaw) return json(200, { ok:true, processed:0, note:"no index yet" });

    const ids = JSON.parse(Buffer.from(idxRaw).toString("utf8"));
    if(!Array.isArray(ids) || ids.length === 0) return json(200, { ok:true, processed:0, note:"empty index" });

    const batch = ids.slice(0, BATCH_LIMIT);
    let processed = 0, updated = 0, withTxid = 0;

    for(const id of batch){
      try{
        const statusKey = `anchor:${id}.json`;
        const stRaw = await store.get(statusKey, { type:"arrayBuffer" });
        if(!stRaw){ processed++; continue; }
        const st = JSON.parse(Buffer.from(stRaw).toString("utf8"));

        const candidates = [ st.receipt_ref, `ots/receipts/${id}.ots`, `ots:${id}.receipt` ].filter(Boolean);
        let bytes = null;
        for(const ref of candidates){
          const b = await store.get(ref, { type:"arrayBuffer" });
          if(b){ bytes = Buffer.from(b); break; }
        }
        if(!bytes){ processed++; continue; }

        const { txid, confirmations } = await sidecarTxidFromReceipt(bytes.toString("base64"));

        let changed = false;
        if(txid && txid !== st.txid){ st.txid = txid; changed = true; withTxid++; }
        if(Number.isFinite(confirmations) && confirmations !== (st.confirmations ?? 0)){
          st.confirmations = confirmations; changed = true;
        }

        if(changed){
          st.updatedAt = new Date().toISOString();
          await store.set(statusKey, JSON.stringify(st), {
            metadata:{ contentType:"application/json; charset=utf-8" }
          });
          updated++;
        }
        processed++;
      }catch{
        processed++;
      }
    }

    return json(200, { ok:true, processed, updated, withTxid, batch:batch.length, total:ids.length });
  }catch(e){
    console.error("resolve_cron error:", e);
    return json(500, { error: e.message });
  }
};