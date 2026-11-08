// verified_check.js — Netlify function
// v2.0.0 — Real lookup from Netlify Blobs (store "proofs", key "verified:{slug}")
//          + one-click badge copy page at /verified/{slug}/badge
// URL patterns (see netlify.toml):
//   /verified/:slug        → public verification page
//   /verified/:slug/badge  → "Copy my badge" page (linked from the badge email)

const { getVerified, badgeHtml, escapeHtml } = require("./_verified");

// Test fixtures — used only when no real record exists for the slug
const MOCK_DATA = {
  "acme-law": { name: "Acme Law Group", since: "October 2026", documents: 47, active: true },
  "test": { name: "Test Business", since: "November 2026", documents: 5, active: true },
};

function formatSince(since) {
  if (!since) return "";
  // Real records store an ISO date; mock data stores "Month YYYY"
  if (/^\d{4}-\d{2}-\d{2}/.test(since)) {
    const d = new Date(since);
    if (!isNaN(d)) {
      return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    }
  }
  return String(since);
}

function parseRequest(event) {
  const qs = event.queryStringParameters || {};
  const path = (event.rawUrl ? new URL(event.rawUrl).pathname : event.path) || "";
  let slug = qs.slug || "";
  let view = qs.view || "";

  if (!slug) {
    const parts = path.replace(/^\/verified\/?/, "").split("/").filter(Boolean);
    slug = parts[0] || "";
    if (parts[1] === "badge") view = "badge";
  }
  if (/\/badge\/?$/.test(path)) view = "badge";

  slug = String(slug).toLowerCase().replace(/[^a-z0-9-]/g, "");
  return { slug, view };
}

exports.handler = async (event) => {
  const { slug, view } = parseRequest(event);

  // If no slug, show the general Verified program page
  if (!slug) {
    return { statusCode: 302, headers: { Location: "/verified-program.html" } };
  }

  let business = null;
  try {
    const rec = await getVerified(slug);
    if (rec && rec.active !== false) business = rec;
  } catch (err) {
    console.error("[verified_check] lookup error:", err);
  }
  if (!business && MOCK_DATA[slug]) business = MOCK_DATA[slug];

  const name = business ? escapeHtml(business.name) : "";
  const since = business ? escapeHtml(formatSince(business.since)) : "";
  const documents = business ? Number(business.documents) || 0 : 0;
  const isBadgeView = view === "badge" && !!business;

  const pageTitle = !business
    ? "Not Found — docuProof"
    : isBadgeView
      ? "Your docuProof Verified badge"
      : `${name} — docuProof Verified`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pageTitle}</title>
${isBadgeView ? '<meta name="robots" content="noindex">' : ""}
<link rel="icon" href="/docuproof-logo.png">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0d10;--bg-card:#12161c;--bg-elevated:#1a1f27;--ink:#e8eaed;--muted:#8b949e;--accent:#22c55e;--accent-glow:rgba(34,197,94,0.15);--border:#21262d}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font:16px/1.6 'Outfit',sans-serif;min-height:100vh;display:flex;flex-direction:column}
a{color:var(--accent);text-decoration:none}
.nav{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(10,13,16,0.95);border-bottom:1px solid var(--border)}
.nav-inner{max-width:1200px;margin:0 auto;padding:14px 24px;display:flex;justify-content:space-between;align-items:center}
.nav-brand{display:flex;align-items:center;gap:10px;color:var(--ink)}
.nav-brand img{height:32px}
.nav-brand span{font-weight:700;font-size:18px}
.nav-links{display:flex;gap:24px;align-items:center}
.nav-links a{color:var(--muted);font-size:14px}
.nav-cta{background:var(--accent);color:#000!important;padding:8px 18px;border-radius:8px;font-weight:700}
.main{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:120px 24px 60px;text-align:center}
.verified-card{background:var(--bg-card);border:2px solid var(--accent);border-radius:20px;padding:48px 40px;max-width:520px;width:100%;box-shadow:0 0 80px var(--accent-glow)}
.shield{position:relative;width:64px;height:64px;margin:0 auto 24px}
.shield img{width:64px;height:64px;border-radius:16px;object-fit:cover}
.shield .dp-star{position:absolute;bottom:-5px;right:-5px;width:22px;height:22px;background:#f59e0b;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;line-height:1;box-shadow:0 0 0 3px var(--bg)}
.biz-name{font-size:28px;font-weight:800;margin-bottom:4px}
.verified-label{font-size:14px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:24px}
.stats{display:flex;justify-content:center;gap:40px;margin-bottom:28px;padding:20px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)}
.stat-item{text-align:center}
.stat-val{font-size:24px;font-weight:800;color:var(--accent)}
.stat-lbl{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.06em}
.trust-msg{font-size:15px;color:var(--muted);line-height:1.6;margin-bottom:28px}
.cta-section{margin-top:32px}
.cta-section p{font-size:14px;color:var(--muted);margin-bottom:12px}
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;background:var(--accent);color:#000!important}
.not-found{max-width:480px}
.not-found h2{font-size:24px;font-weight:800;margin-bottom:12px}
.not-found p{color:var(--muted);margin-bottom:24px}
.footer{padding:32px 24px;text-align:center}
.footer-copy{font-size:13px;color:var(--muted)}
/* badge copy page */
.badge-card{background:var(--bg-card);border:2px solid var(--accent);border-radius:20px;padding:40px 36px;max-width:640px;width:100%;box-shadow:0 0 80px var(--accent-glow);text-align:center}
.badge-card h1{font-size:28px;font-weight:800;margin-bottom:6px}
.badge-card .sub{color:var(--muted);margin-bottom:24px}
.badge-preview{display:inline-block;background:#fff;border-radius:12px;padding:16px 22px;margin-bottom:24px}
.btn-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn{border:0;cursor:pointer;font-family:inherit}
.btn.big{font-size:17px;padding:16px 34px}
.btn.ghost{background:transparent;color:var(--ink)!important;border:1px solid var(--border)}
.copied-msg{min-height:24px;margin-top:14px;font-size:14px;font-weight:600;color:var(--accent)}
.howto{margin-top:32px;text-align:left;border-top:1px solid var(--border);padding-top:24px}
.howto h2{font-size:18px;margin-bottom:12px}
.tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.tab{background:var(--bg-elevated);color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:8px 16px;font:600 14px 'Outfit',sans-serif;cursor:pointer}
.tab.active{background:var(--accent);color:#000;border-color:var(--accent)}
.panel{display:none}
.panel.active{display:block}
.panel ol{padding-left:20px;color:var(--muted);font-size:15px}
.panel li{margin-bottom:8px}
.panel strong{color:var(--ink)}
.page-link{margin-top:24px;font-size:14px;color:var(--muted)}
@media(max-width:600px){.nav-links a:not(.nav-cta){display:none}.verified-card{padding:32px 24px}.stats{gap:24px}.badge-card{padding:28px 18px}}
</style>
</head>
<body>

<nav class="nav"><div class="nav-inner"><a href="/" class="nav-brand"><img src="/docuproof-logo.png" alt=""><span>docuProof</span></a><div class="nav-links"><a href="/#how">How It Works</a><a href="/#pricing">Pricing</a><a href="/#faq">FAQ</a><a href="/verify">Verify</a><a href="/app.html" class="nav-cta">Generate Proof</a></div></div></nav>

<main class="main">
${!business ? `
<div class="not-found">
  <h2>Business not found</h2>
  <p>This verification link doesn't match any active docuProof Verified business. The link may be outdated or incorrect.</p>
  <a href="/verified-program.html" class="btn">Learn about docuProof Verified</a>
</div>
` : isBadgeView ? `
<div class="badge-card">
  <h1>Your badge is ready 🎉</h1>
  <p class="sub">Click the button, then paste into your email signature settings.</p>

  <div class="badge-preview" id="badge">${badgeHtml(slug)}</div>

  <div class="btn-row">
    <button class="btn big" id="copyBadge" type="button">Copy badge</button>
    <button class="btn ghost" id="copyCode" type="button">Copy HTML code</button>
  </div>
  <div class="copied-msg" id="msg" role="status" aria-live="polite"></div>

  <div class="howto">
    <h2>Where to paste it</h2>
    <div class="tabs">
      <button class="tab active" data-tab="gmail" type="button">Gmail</button>
      <button class="tab" data-tab="outlook" type="button">Outlook</button>
      <button class="tab" data-tab="apple" type="button">Apple Mail</button>
    </div>
    <div class="panel active" id="p-gmail"><ol>
      <li>Click <strong>Copy badge</strong> above.</li>
      <li>In Gmail, click the <strong>gear icon → See all settings</strong>.</li>
      <li>On the <strong>General</strong> tab, scroll to <strong>Signature</strong> and click inside your signature (or <strong>Create new</strong>).</li>
      <li>Paste with <strong>Ctrl+V</strong> (Windows) or <strong>⌘V</strong> (Mac).</li>
      <li>Scroll to the bottom and click <strong>Save Changes</strong>.</li>
    </ol></div>
    <div class="panel" id="p-outlook"><ol>
      <li>Click <strong>Copy badge</strong> above.</li>
      <li><strong>Outlook on the web / new Outlook:</strong> Settings (gear) → <strong>Mail</strong> or <strong>Accounts</strong> → <strong>Signatures</strong>.</li>
      <li><strong>Classic Outlook for Windows:</strong> File → Options → Mail → <strong>Signatures…</strong></li>
      <li>Click inside your signature and paste, then click <strong>Save</strong> (or <strong>OK</strong>).</li>
    </ol></div>
    <div class="panel" id="p-apple"><ol>
      <li>Click <strong>Copy badge</strong> above.</li>
      <li>In Mail, open <strong>Mail → Settings → Signatures</strong>.</li>
      <li>Select your signature and <strong>uncheck “Always match my default message font”</strong>.</li>
      <li>Click inside the signature box and paste with <strong>⌘V</strong>. It saves automatically.</li>
    </ol></div>
  </div>

  <p class="page-link">Your badge links to your public page: <a href="/verified/${slug}">docuproof.io/verified/${slug}</a></p>
</div>
` : `
<div class="verified-card">
  <div class="shield"><img src="/docuproof-logo.png" alt="docuProof"><span class="dp-star">★</span></div>
  <div class="biz-name">${name}</div>
  <div class="verified-label">docuProof Verified ✓</div>

  <div class="stats">
    <div class="stat-item">
      <div class="stat-val">${since}</div>
      <div class="stat-lbl">Verified since</div>
    </div>
    ${documents > 0 ? `<div class="stat-item">
      <div class="stat-val">${documents}+</div>
      <div class="stat-lbl">Documents verified</div>
    </div>` : `<div class="stat-item">
      <div class="stat-val">Active</div>
      <div class="stat-lbl">Subscriber</div>
    </div>`}
  </div>

  <p class="trust-msg">This business actively verifies their important documents with docuProof — creating permanent, blockchain-anchored proof that their files existed at specific moments in time. All verified documents are independently verifiable and tamper-proof.</p>

  <div class="cta-section">
    <p>Protect your own documents the same way</p>
    <a href="/app.html" class="btn">Get Your Proof — $2.89 per document</a>
  </div>
</div>
`}
</main>

<footer class="footer">
<div class="footer-copy">© <span id="yr"></span> docuProof.io — Blockchain-anchored proof of existence</div>
</footer>

<script>document.getElementById('yr').textContent=new Date().getFullYear();</script>
${isBadgeView ? `<script>
(function(){
  var badge=document.getElementById('badge');
  var code=${JSON.stringify(badgeHtml(slug)).replace(/</g, "\\u003c")};
  var msg=document.getElementById('msg');
  function say(t){msg.textContent=t;setTimeout(function(){if(msg.textContent===t)msg.textContent='';},6000);}

  // Fallback: select the rendered badge and copy it as rich content
  function copyRendered(){
    var r=document.createRange();r.selectNode(badge);
    var s=window.getSelection();s.removeAllRanges();s.addRange(r);
    var ok=false;try{ok=document.execCommand('copy');}catch(e){}
    s.removeAllRanges();return ok;
  }
  function copyText(t){
    var ta=document.createElement('textarea');ta.value=t;ta.style.position='fixed';ta.style.opacity='0';
    document.body.appendChild(ta);ta.select();var ok=false;try{ok=document.execCommand('copy');}catch(e){}
    document.body.removeChild(ta);return ok;
  }

  document.getElementById('copyBadge').addEventListener('click',function(){
    var done=function(){say('✓ Badge copied — now paste it into your signature settings.');};
    var fail=function(){if(copyRendered())done();else say('Copy blocked by your browser — select the badge above and press Ctrl+C / ⌘C.');};
    try{
      if(navigator.clipboard&&window.ClipboardItem){
        var item=new ClipboardItem({
          'text/html':new Blob([code],{type:'text/html'}),
          'text/plain':new Blob(['docuProof VERIFIED ✓ https://docuproof.io/verified/${slug}'],{type:'text/plain'})
        });
        navigator.clipboard.write([item]).then(done,fail);
      }else fail();
    }catch(e){fail();}
  });

  document.getElementById('copyCode').addEventListener('click',function(){
    var done=function(){say('✓ HTML code copied.');};
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(code).then(done,function(){if(copyText(code))done();});
    }else if(copyText(code))done();
  });

  var tabs=document.querySelectorAll('.tab');
  tabs.forEach(function(t){t.addEventListener('click',function(){
    tabs.forEach(function(x){x.classList.remove('active');});
    document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active');});
    t.classList.add('active');document.getElementById('p-'+t.dataset.tab).classList.add('active');
  });});
  // Pre-select the tab that matches the visitor's likely mail app
  if(/Mac|iPhone|iPad/.test(navigator.platform||'')&&!/Chrome/.test(navigator.userAgent)){var a=document.querySelector('[data-tab=apple]');if(a)a.click();}
})();
</script>` : ""}
</body>
</html>`;

  return {
    statusCode: business ? 200 : 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: html,
  };
};
