// netlify/functions/verify_page.js
// CJS: serves a lightweight HTML verification UI that calls your JSON endpoints:
// - /.netlify/functions/anchor_status?id=...
// - /.netlify/functions/download_receipt?id=...
// - /.netlify/functions/download_receipt_json?id=...
// - /.netlify/functions/verify?id=...

exports.handler = async (event) => {
  // Allow either query param (?id=...) or path form /v/<id>
  const url = new URL(event.rawUrl || "http://x/");
  const qsId = (url.searchParams.get("id") || "").trim();
  const pathId = (event.path || "")
    .split("/")
    .slice(-1)[0]
    .includes("?")
      ? ""
      : (event.path || "").split("/").slice(-1)[0];

  const id = (qsId || pathId || "").trim();

  const html = TEMPLATE_HTML
    .replace("__ID__", escapeHtml(id || ""))
    .replace(/__HAS_ID__/g, id ? "true" : "false");

  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
    body: html,
  };
};

const TEMPLATE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>Verify Proof — docuProof</title>
<meta name="description" content="Verify a Bitcoin-anchored proof-of-existence created with docuProof.">

<link rel="icon" href="/docuproof-logo.png">
<meta name="theme-color" content="#0b0f14">
<style>
  :root{
    --bg:#0b0f14;--ink:#eaeaea;--muted:#a7b0ba;--accent:#22C55E;
    --card:#151b22;--border:#1e2630;--link:#9cc1ff;
    --danger:#ffb4b4;--danger-bg:#1a0b0b;
    --neutral-bg:#151821;--neutral-border:#303749;--neutral-text:#cbd3e1;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    background:var(--bg);
    color:var(--ink);
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  }
  a{color:var(--link)}
  header,main,footer{max-width:1100px;margin:auto;padding:16px 20px}
  .header{
    display:flex;
    align-items:center;
    justify-content:space-between;
    border-bottom:1px solid var(--border);
  }
  .brand{display:flex;gap:10px;align-items:center;text-decoration:none;color:var(--ink)}
  .brand img{height:32px}
  h1{font-size:28px;margin:16px 0}
  .card{
    background:var(--card);
    border:1px solid var(--border);
    border-radius:12px;
    padding:18px;
  }
  .row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  input,button{
    border-radius:10px;
    border:1px solid var(--border);
    background:#0f141a;
    color:var(--ink);
    padding:10px 12px;
  }
  .btn{
    background:var(--accent);
    color:#071109;
    border:none;
    font-weight:800;
    cursor:pointer;
  }
  .btn.secondary{background:transparent;color:var(--ink)}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
  .badge{
    display:inline-flex;
    align-items:center;
    gap:8px;
    border-radius:999px;
    padding:6px 12px;
    font-weight:600;
    font-size:13px;
  }
  .badge.err{
    border:1px solid var(--danger);
    color:var(--danger);
    background:var(--danger-bg);
  }
  .badge.neutral{
    border:1px solid var(--neutral-border);
    color:var(--neutral-text);
    background:var(--neutral-bg);
  }
  .badge.ok{
    border:1px solid #1e5131;
    color:#9af3b4;
    background:#0d1912;
  }
  .grid{
    display:grid;
    gap:16px;
    grid-template-columns:1fr 380px;
  }
  @media (max-width:1000px){
    .grid{grid-template-columns:1fr}
  }
  .small{font-size:13px;color:#b9c2cc}
  .kv{
    display:grid;
    grid-template-columns:140px 1fr;
    gap:6px 12px;
  }
  .kv div{
    padding:6px 0;
    border-bottom:1px dashed #223;
  }
  .helper{
    font-size:12px;
    color:var(--muted);
    margin-top:4px;
  }
  footer{
    color:var(--muted);
    text-align:center;
    border-top:1px solid var(--border);
    margin-top:24px;
    padding:24px 20px;
  }
</style>
</head>
<body>
  <header class="header">
    <a class="brand" href="/" aria-label="docuProof home">
      <img src="/docuproof-logo.png" alt="docuProof">
      <strong>docuProof</strong>
    </a>
    <nav>
      <a href="/start.html">Start</a> · <a href="/app">Generate</a>
    </nav>
  </header>

  <main>
    <h1>Verify Proof</h1>

    <div class="card" style="margin:12px 0 18px">
      <div class="row">
        <input id="idIn" class="mono" placeholder="Enter Proof ID (e.g., cs_… or wXXXXXXXXX)" style="min-width:320px;flex:1">
        <button id="goBtn" class="btn">Open</button>
        <a id="jsonLink" class="btn secondary" href="#" target="_blank" rel="noopener">View JSON</a>
      </div>
      <div class="small" style="margin-top:6px">
        Tip: If you downloaded a <code>.ots</code> file, you can verify independently with
        <code class="mono">ots verify yourfile.ots</code>.
      </div>
    </div>

    <div class="grid">
      <section class="card">
        <div id="statusBadges" class="row" style="margin-bottom:4px"></div>
        <div id="statusHelp" class="helper"></div>

        <div class="kv small mono" id="kv">
          <div>ID</div><div id="kv_id">—</div>
          <div>State</div><div id="kv_state">—</div>
          <div>TxID</div><div id="kv_txid">—</div>
          <div>Confirmations</div><div id="kv_conf">—</div>
          <div>Anchor JSON</div><div id="kv_anchor">—</div>
          <div>Receipt</div><div id="kv_receipt">—</div>
        </div>
      </section>

      <aside class="card">
        <h3 style="margin-top:0">Downloads</h3>
        <div class="row" style="margin:10px 0">
          <button id="dlOts" class="btn" disabled>Download OTS receipt</button>
          <button id="dlCert" class="btn secondary" disabled>View verification JSON</button>
        </div>
        <div class="small">
          Keep your original file and this <code>.ots</code> together so future verification is trivial.
        </div>
      </aside>
    </div>
  </main>

  <footer>
    © <span id="year"></span> docuProof.io — Bitcoin-anchored proof of existence.
  </footer>

<script>
  const $ = (id)=>document.getElementById(id);
  document.getElementById('year').textContent = new Date().getFullYear();

  const idFromServer = "__ID__";
  const hasId = __HAS_ID__;
  const idIn = $('idIn'), goBtn = $('goBtn'), jsonLink = $('jsonLink');
  const kv = {
    id: $('kv_id'), state: $('kv_state'), txid: $('kv_txid'),
    conf: $('kv_conf'), anchor: $('kv_anchor'), receipt: $('kv_receipt')
  };
  const badges = $('statusBadges');
  const help = $('statusHelp');
  const dlOts = $('dlOts'), dlCert = $('dlCert');

  if (hasId && idFromServer) { idIn.value = idFromServer; }

  goBtn.addEventListener('click', ()=>{
    const v = (idIn.value||'').trim();
    if (!v) return;
    const qs = new URLSearchParams({ id: v }).toString();
    location.href = "/.netlify/functions/verify_page?" + qs;
  });

  jsonLink.addEventListener('click', (e)=>{
    const v = (idIn.value||'').trim();
    if (!v){
      e.preventDefault();
      return;
    }
    jsonLink.href = "/.netlify/functions/verify?id=" + encodeURIComponent(v);
  });

  async function fetchJson(u){
    const r = await fetch(u, { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP "+r.status);
    return r.json();
  }

  function resetUI(){
    badges.innerHTML = "";
    help.textContent = "";
    for (const k of Object.keys(kv)) kv[k].textContent = "—";
    dlOts.disabled = true;
    dlCert.disabled = true;
  }

  function addBadge(kind, text){
    const span = document.createElement('span');
    span.className = "badge " + kind;
    span.textContent = text;
    badges.appendChild(span);
  }

  async function load(){
    resetUI();
    const v = (idIn.value||"").trim();
    if (!v){
      addBadge("neutral", "Enter an ID to verify");
      help.textContent = "Paste a Proof ID from your certificate or email receipt, then select Open.";
      return;
    }

    kv.id.textContent = v;
    jsonLink.href = "/.netlify/functions/verify?id=" + encodeURIComponent(v);
    dlCert.disabled = false;

    let status;
    try{
      status = await fetchJson("/.netlify/functions/anchor_status?id=" + encodeURIComponent(v));
    }catch(e){
      addBadge("err", "Status lookup failed");
      help.textContent = "We couldn’t retrieve status for this ID. Try again in a moment, or confirm the ID from your certificate.";
      return;
    }

    const state = status && status.state || "NOT_FOUND";

    kv.state.textContent = state;
    kv.txid.textContent  = status && status.txid || "—";
    kv.conf.textContent  = (status && (status.confirmations ?? 0)) || 0;
    kv.anchor.textContent= status && status.anchorKey || "—";

    if (state === "NOT_FOUND"){
      addBadge("neutral", "No proof found yet");
      help.textContent =
        "We don’t see a receipt or Bitcoin anchor for this ID yet. If you just created this proof, allow time for batching " +
        "and anchoring. You can still verify independently later using your .ots receipt and original file.";
      return;
    }

    if (state === "OTS_RECEIPT"){
      addBadge("ok", "Receipt available — awaiting anchor");
      help.textContent =
        "Your proof has a valid OpenTimestamps receipt and is queued to be batched into a Bitcoin transaction. " +
        "Once anchored, this page will show the Bitcoin transaction ID and confirmations.";

      try{
        const dj = await fetchJson("/.netlify/functions/download_receipt_json?id=" + encodeURIComponent(v));
        if (dj && dj.base64 && dj.base64.length){
          kv.receipt.textContent = dj.key || (v + ".ots");
          dlOts.disabled = false;
          dlOts.onclick = ()=>{ window.location.href = "/.netlify/functions/download_receipt?id=" + encodeURIComponent(v); };
        }else{
          kv.receipt.textContent = "—";
        }
      }catch{
        kv.receipt.textContent = "—";
      }
      return;
    }

    // Anchored (or any other non-NOT_FOUND state)
    addBadge("ok", "Anchored on Bitcoin");
    help.textContent =
      "This proof has been anchored to the Bitcoin blockchain. The transaction ID and confirmation count shown above " +
      "can be verified independently using any Bitcoin block explorer.";

    if (status && status.txid){
      kv.txid.textContent = status.txid;
    }
  }

  if (hasId && idFromServer){
    load();
  }
</script>
</body>
</html>`;

function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => (
    { "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]
  ));
}