// verified_check.js — Netlify function
// Renders a verification page for docuProof Verified businesses
// URL pattern: /verified/:slug
// For now, uses a placeholder/mock. Later: pull from Netlify Blobs.

exports.handler = async (event) => {
  const path = event.path || "";
  const slug = path.replace(/^\/verified\/?/, "").replace(/\/$/, "");

  // If no slug, show the general Verified program page
  if (!slug) {
    return {
      statusCode: 302,
      headers: { Location: "/verified-program.html" },
    };
  }

  // ── TODO: Replace with real lookup from Netlify Blobs ──
  // For now, return a "not found" page or a mock for testing.
  // To test: /verified/acme-law → shows mock verified page
  // In production, look up `verified:{slug}` from the Blobs store.

  const mockData = {
    "acme-law": {
      name: "Acme Law Group",
      since: "October 2026",
      documents: 47,
      active: true,
    },
    "test": {
      name: "Test Business",
      since: "November 2026",
      documents: 5,
      active: true,
    },
  };

  const business = mockData[slug] || null;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${business ? `${business.name} — docuProof Verified` : "Not Found — docuProof"}</title>
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
@media(max-width:600px){.nav-links a:not(.nav-cta){display:none}.verified-card{padding:32px 24px}.stats{gap:24px}}
</style>
</head>
<body>

<nav class="nav"><div class="nav-inner"><a href="/" class="nav-brand"><img src="/docuproof-logo.png" alt=""><span>docuProof</span></a><div class="nav-links"><a href="/#how">How It Works</a><a href="/#pricing">Pricing</a><a href="/#faq">FAQ</a><a href="/verify">Verify</a><a href="/app.html" class="nav-cta">Generate Proof</a></div></div></nav>

<main class="main">
${business ? `
<div class="verified-card">
  <div class="shield"><img src="/docuproof-logo.png" alt="docuProof"><span class="dp-star">★</span></div>
  <div class="biz-name">${business.name}</div>
  <div class="verified-label">docuProof Verified ✓</div>

  <div class="stats">
    <div class="stat-item">
      <div class="stat-val">${business.since}</div>
      <div class="stat-lbl">Verified since</div>
    </div>
    <div class="stat-item">
      <div class="stat-val">${business.documents}+</div>
      <div class="stat-lbl">Documents verified</div>
    </div>
  </div>

  <p class="trust-msg">This business actively verifies their important documents with docuProof — creating permanent, blockchain-anchored proof that their files existed at specific moments in time. All verified documents are independently verifiable and tamper-proof.</p>

  <div class="cta-section">
    <p>Protect your own documents the same way</p>
    <a href="/app.html" class="btn">Get Your Proof — $2.89 per document</a>
  </div>
</div>
` : `
<div class="not-found">
  <h2>Business not found</h2>
  <p>This verification link doesn't match any active docuProof Verified business. The link may be outdated or incorrect.</p>
  <a href="/verified-program.html" class="btn">Learn about docuProof Verified</a>
</div>
`}
</main>

<footer class="footer">
<div class="footer-copy">© <span id="yr"></span> docuProof.io — Proof of Existence on the blockchain.</div>
</footer>

<script>document.getElementById('yr').textContent=new Date().getFullYear();</script>
</body>
</html>`;

  return {
    statusCode: business ? 200 : 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: html,
  };
};
