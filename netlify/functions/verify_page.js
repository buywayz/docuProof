"use strict";

/*
  netlify/functions/verify_page.js  v5.1.0

  Changes from v5.0.0:
  - FIX: Email capture section is now hidden dynamically via JS after checking
    whether proof has a customerEmail (paid proof), instead of relying on
    ?source=paid URL param which gets lost on subsequent visits
  - Still supports ?source=paid as an immediate hint (no flash of wrong content)
  - Share heading + rpi-label colors: orange (#f59e0b)
*/

exports.handler = async (event) => {
  const rawUrl =
    event.rawUrl ||
    ("https://docuproof.local" + (event.path || "/verify"));

  let initialId = "";
  let sourcePaid = false;

  try {
    const url = new URL(rawUrl);
    const qsId = (url.searchParams.get("id") || "").trim();
    if (qsId) initialId = qsId;
    sourcePaid = url.searchParams.get("source") === "paid";
  } catch {
    // ignore
  }

  // Support /v/:id
  if (!initialId && event.path) {
    const parts = event.path.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    if (last && !last.includes("?") && last !== "verify" && last !== "v") {
      initialId = last;
    }
  }

  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
    body: buildHtml(initialId, sourcePaid),
  };
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(initialId, sourcePaid) {
  const yr = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Your Proof \u2022 docuProof</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="/docuproof-logo.png">

<style>
:root {
  --bg: #0a0d10;
  --card: #12161c;
  --border: #21262d;
  --text: #e8eaed;
  --muted: #8b949e;
  --dim: #6b7280;
  --accent: #22c55e;
  --accent-hover: #1ea550;
  --accent-glow: rgba(34, 197, 94, 0.15);
  --warn-text: #f4d28a;
  --ok-bg: #0d1912;
  --ok-border: #1e5131;
  --ok-text: #9af3b4;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

.shell { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

/* Header */
.header { border-bottom: 1px solid var(--border); padding: 16px 0; margin-bottom: 32px; }
.header-inner { display: flex; justify-content: space-between; align-items: center; }
.logo { display: flex; gap: 12px; align-items: center; text-decoration: none; color: var(--text); }
.logo img { width: 36px; height: 36px; }
.logo-text { line-height: 1.2; }
.logo-title { font-weight: 700; font-size: 18px; }
.logo-sub { font-size: 11px; letter-spacing: .08em; color: var(--muted); text-transform: uppercase; }

.btn-primary {
  background: var(--accent); color: #0a0d10; border: none;
  padding: 12px 24px; border-radius: 999px; font-weight: 700;
  font-size: 15px; cursor: pointer; text-decoration: none;
  transition: background 0.2s; display: inline-block;
}
.btn-primary:hover { background: var(--accent-hover); }

/* Layout */
.content { padding-bottom: 60px; }
.layout { display: grid; grid-template-columns: 1.15fr 1fr; gap: 24px; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }

.panel {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 16px; padding: 28px;
}

/* Lookup bar */
.lookup-bar { margin-bottom: 20px; }
.lookup-bar .label {
  font-size: 11px; letter-spacing: .12em; color: var(--muted);
  text-transform: uppercase; margin-bottom: 8px;
}
.input-row { display: flex; gap: 12px; }
.input-row input {
  flex: 1; border-radius: 12px; padding: 14px 18px;
  background: #1a1f24; border: 1px solid var(--border);
  color: var(--text); font-size: 16px; outline: none;
}
.input-row input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
.input-row input::placeholder { color: var(--dim); }

/* Section titles */
.section-title {
  font-size: 13px; letter-spacing: .08em; color: var(--accent);
  text-transform: uppercase; font-weight: 700; margin-bottom: 10px;
}

/* Pills */
.pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 16px; border-radius: 999px;
  font-size: 13px; font-weight: 600; margin-bottom: 16px;
}
.pill-waiting { background: #1a1f24; color: var(--muted); border: 1px solid var(--border); }
.pill-pending { background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; }
.pill-success { background: linear-gradient(135deg, #22c55e, #16a34a); color: #000; }
.pill-error { background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; }

/* Share section */
.share-section { margin-bottom: 16px; position: relative; }
.share-heading {
  font-size: 14px; font-weight: 600; color: #f59e0b;
  margin-bottom: 10px; line-height: 1.4;
}
.share-heading span { color: #f59e0b; }
.share-buttons {
  display: flex; gap: 10px; flex-wrap: wrap; position: relative;
}
.share-btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 10px;
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  text-decoration: none; border: 1px solid var(--border);
  background: #1a1f24; color: var(--text); font-family: inherit;
}
.share-btn:hover {
  border-color: var(--accent); color: var(--accent);
  background: rgba(34, 197, 94, 0.08);
}
.share-btn svg { width: 16px; height: 16px; flex-shrink: 0; }

/* Share popover */
.share-popover {
  display: none; position: absolute; top: 100%; left: 0;
  margin-top: 8px; background: #1e2328;
  border: 1px solid var(--border); border-radius: 12px;
  padding: 6px; min-width: 260px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5); z-index: 100;
  animation: popIn 0.15s ease-out;
}
.share-popover.show { display: block; }
@keyframes popIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.popover-title {
  font-size: 11px; letter-spacing: .08em; color: var(--muted);
  text-transform: uppercase; padding: 8px 12px 4px;
}
.popover-option {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 8px;
  cursor: pointer; transition: background 0.15s;
  border: none; background: none; width: 100%;
  text-align: left; color: var(--text); font-size: 13px;
  font-family: inherit;
}
.popover-option:hover { background: rgba(34, 197, 94, 0.1); }
.popover-option .pop-icon { font-size: 16px; width: 24px; text-align: center; flex-shrink: 0; }
.popover-option .pop-label { font-weight: 600; color: var(--text); }
.popover-option .pop-desc { font-size: 11px; color: var(--dim); margin-top: 1px; }

/* Toast */
.toast {
  display: none; position: fixed; bottom: 24px; left: 50%;
  transform: translateX(-50%);
  background: var(--accent); color: #000; font-weight: 700; font-size: 14px;
  padding: 12px 24px; border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  animation: toastIn 0.25s ease-out; z-index: 200;
}
.toast.show { display: block; }
@keyframes toastIn {
  from { opacity: 0; transform: translateX(-50%) translateY(12px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* Fields */
.field {
  display: flex; justify-content: space-between; align-items: flex-start;
  font-size: 14px; padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.field:last-of-type { border-bottom: none; }
.field-label { font-size: 11px; letter-spacing: .12em; color: var(--muted); text-transform: uppercase; }
.field-value { text-align: right; color: var(--text); }
.block-link { color: var(--accent); text-decoration: none; }
.block-link:hover { text-decoration: underline; }

/* Explainer */
.explainer {
  background: #0d1912; border: 1px solid #1e5131; border-radius: 12px;
  padding: 16px 18px; margin: 16px 0; font-size: 14px;
  line-height: 1.65; color: #c9d2db;
}
.explainer strong { color: var(--accent); }
.explainer p { margin: 0 0 10px; }
.explainer p:last-child { margin-bottom: 0; }

/* Email capture — orange themed */
.email-section {
  margin-top: 20px; padding-top: 20px;
  border-top: 1px dashed rgba(255,255,255,0.1);
}
.email-section h3 { font-size: 16px; font-weight: 700; margin-bottom: 6px; color: #f59e0b; }
.email-section > p { font-size: 13px; color: var(--muted); margin-bottom: 12px; line-height: 1.5; }
.email-row { display: flex; gap: 10px; }
.email-row input {
  flex: 1; border-radius: 10px; padding: 12px 16px;
  background: #1a1f24; border: 1px solid var(--border);
  color: var(--text); font-size: 15px; outline: none;
}
.email-row input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-glow); }
.email-row input::placeholder { color: var(--dim); }
.email-row button {
  background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; border: none;
  padding: 12px 20px; border-radius: 10px; font-weight: 700;
  font-size: 14px; cursor: pointer; white-space: nowrap; transition: all 0.2s;
  font-family: inherit;
}
.email-row button:hover { filter: brightness(1.1); }
.email-row button:disabled { opacity: 0.5; cursor: default; }
.email-success {
  display: none; padding: 12px 16px; background: var(--ok-bg);
  border: 1px solid var(--ok-border); border-radius: 10px;
  color: var(--ok-text); font-size: 14px; font-weight: 600;
}

/* Right panel */
.right-panel h2 { font-size: 22px; font-weight: 700; margin-bottom: 16px; }
.right-panel p { color: #c9d2db; line-height: 1.7; margin-bottom: 14px; font-size: 14px; }
.right-panel strong { color: var(--accent); }

/* Blockchain visual */
.blockchain-visual {
  background: #1a1f24; border: 1px solid var(--border); border-radius: 12px;
  padding: 16px; margin: 16px 0; text-align: center;
}
.blockchain-visual .bv-label {
  font-size: 11px; letter-spacing: .1em; color: var(--muted);
  text-transform: uppercase; margin-bottom: 10px;
}
.blockchain-visual .bv-link {
  display: inline-flex; align-items: center; gap: 8px;
  color: var(--accent); text-decoration: none; font-weight: 600;
  font-size: 14px; padding: 10px 20px; border: 1px solid var(--accent);
  border-radius: 8px; transition: all 0.2s;
}
.blockchain-visual .bv-link:hover { background: var(--accent-glow); }
.bv-pending { color: var(--warn-text); font-size: 13px; font-style: italic; }

/* Right proof ID */
.right-proof-id {
  background: #1a1f24; border: 1px solid var(--border); border-radius: 12px;
  padding: 14px 16px; margin: 16px 0;
}
.right-proof-id .rpi-label {
  font-size: 11px; letter-spacing: .1em; color: #f59e0b;
  text-transform: uppercase; margin-bottom: 6px;
}
.right-proof-id .rpi-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px; color: var(--accent); word-break: break-all; cursor: pointer;
}
.right-proof-id .rpi-hint { font-size: 11px; color: var(--dim); margin-top: 4px; }

/* Certificate teaser */
.cert-teaser {
  border: 1px solid var(--border); border-radius: 12px;
  overflow: hidden; margin: 16px 0;
}
.cert-teaser img { width: 100%; display: block; opacity: 0.85; transition: opacity 0.2s; }
.cert-teaser:hover img { opacity: 1; }
.cert-teaser-label {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #0a0d10; padding: 10px 16px; font-weight: 700; font-size: 13px; text-align: center;
}
.cert-teaser-sublabel {
  background: var(--card); padding: 10px 16px;
  font-size: 12px; color: var(--muted); text-align: center; line-height: 1.5;
}
.cert-teaser a { color: var(--accent); text-decoration: none; font-weight: 600; }
.cert-teaser a:hover { text-decoration: underline; }

/* Footer */
.footer {
  text-align: center; font-size: 13px; color: var(--muted);
  padding: 24px 0; border-top: 1px solid var(--border); margin-top: 48px;
}
</style>
</head>

<body>

<header class="header">
  <div class="shell">
    <div class="header-inner">
      <a href="/" class="logo">
        <img src="/docuproof-logo.png" alt="docuProof">
        <div class="logo-text">
          <div class="logo-title">docuProof</div>
          <div class="logo-sub">Proof you can point to.</div>
        </div>
      </a>
      <a href="/app.html" class="btn-primary">Generate Proof</a>
    </div>
  </div>
</header>

<main class="content">
  <div class="shell">
    <div class="layout">

      <!-- LEFT PANEL -->
      <section class="panel" id="leftPanel">

        <div class="lookup-bar" id="lookupBar">
          <div class="label">Proof ID</div>
          <div class="input-row">
            <input id="proof-id" value="${esc(initialId)}" placeholder="e.g. cs_live_... or free_abc123..." />
            <button id="btn-check" class="btn-primary" style="padding:12px 20px;font-size:14px;">Check</button>
          </div>
        </div>

        <div id="pill-state" class="pill pill-waiting">Enter a Proof ID above</div>

        <div id="shareSection" style="display:none;">
          <div class="share-heading">Know someone who needs proof? <span>Share docuProof.</span></div>
          <div class="share-buttons" id="shareButtons">
            <button class="share-btn" data-action="copy" onclick="window._shareOpen(event,'copy')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              Copy Link
            </button>
            <button class="share-btn" data-action="twitter" onclick="window._shareOpen(event,'twitter')">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Post
            </button>
            <button class="share-btn" data-action="linkedin" onclick="window._shareOpen(event,'linkedin')">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              Share
            </button>
            <button class="share-btn" data-action="email" onclick="window._shareOpen(event,'email')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              Email
            </button>
            <div class="share-popover" id="sharePopover">
              <div class="popover-title">Share for&hellip;</div>
              <button class="popover-option" onclick="window._shareGo('business')">
                <span class="pop-icon">&#x1f3e2;</span>
                <div><div class="pop-label">A business</div><div class="pop-desc">Contracts, IP, audit trails</div></div>
              </button>
              <button class="popover-option" onclick="window._shareGo('personal')">
                <span class="pop-icon">&#x1f464;</span>
                <div><div class="pop-label">An individual</div><div class="pop-desc">Wills, photos, personal records</div></div>
              </button>
              <button class="popover-option" onclick="window._shareGo('verify-truth')">
                <span class="pop-icon">&#x1f50d;</span>
                <div><div class="pop-label">Verifying truth</div><div class="pop-desc">Journalism, evidence, accountability</div></div>
              </button>
              <button class="popover-option" onclick="window._shareGo('tech')">
                <span class="pop-icon">&#x1f680;</span>
                <div><div class="pop-label">Tech community</div><div class="pop-desc">Product Hunt, developer circles</div></div>
              </button>
              <button class="popover-option" onclick="window._shareGo('general')">
                <span class="pop-icon">&#x1f517;</span>
                <div><div class="pop-label">General</div><div class="pop-desc">The main docuProof page</div></div>
              </button>
            </div>
          </div>
        </div>

        <div id="statusFields" style="display:none;">
          <div class="field">
            <div class="field-label">Anchor State</div>
            <div id="anchor-state" class="field-value">&mdash;</div>
          </div>
          <div class="field">
            <div class="field-label">Bitcoin Block</div>
            <div id="bitcoin-block" class="field-value">&mdash;</div>
          </div>
          <div class="field">
            <div class="field-label">Confirmations</div>
            <div id="confirmations" class="field-value">&mdash;</div>
          </div>
        </div>

        <div class="explainer" id="explainerBox" style="display:none;">
          <p>
            <strong>What just happened:</strong> We created a unique fingerprint (called a SHA-256 hash) of your file.
            This fingerprint &mdash; not your file &mdash; is being anchored to the Bitcoin blockchain.
          </p>
          <p>
            Think of it like a <strong>permanent seal stamped into the blockchain</strong>: once confirmed, anyone can verify your file existed
            at this exact moment, forever. Your file never left your device &mdash; only the fingerprint did.
          </p>
          <p>
            Your <strong>Proof ID</strong> is your key to find your proof on the blockchain. Save it &mdash;
            it&rsquo;s how you (or anyone) can look up and verify your timestamp anytime.
          </p>
        </div>

        <div class="email-section" id="emailSection" style="display:none;">
          <div id="emailPaidContent" style="display:${sourcePaid ? 'block' : 'none'};">
            <div style="padding:12px 16px;background:#0d1912;border:1px solid #1e5131;border-radius:10px;">
              <p style="color:#9af3b4;font-size:14px;font-weight:600;margin:0 0 8px;">&#10003; Your PDF Certificate will be emailed once your proof is anchored.</p>
              <p style="color:#8b949e;font-size:13px;margin:0;">It will include the Bitcoin block number and all details needed for legal verification.</p>
            </div>
            <div style="margin-top:16px;text-align:center;">
              <a href="/proof-gallery.html" style="color:var(--accent);font-size:14px;font-weight:600;text-decoration:none;">Add your proof to The Proof Gallery &rarr;</a>
            </div>
          </div>
          <div id="emailFreeContent" style="display:${sourcePaid ? 'none' : 'block'};">
            <h3>&#x26a0; Don&rsquo;t lose your proof</h3>
            <p>
              Enter your email and we&rsquo;ll send you your Proof ID plus a notification when
              it&rsquo;s permanently anchored on the Bitcoin blockchain.
            </p>
            <div class="email-row" id="emailRow">
              <input type="email" id="emailInput" placeholder="you@example.com" />
              <button id="emailBtn">Send</button>
            </div>
            <div class="email-success" id="emailSuccess">
              &#10003; Sent! Check your inbox for your proof details.
            </div>
          </div>
        </div>

      </section>

      <!-- RIGHT PANEL -->
      <section class="panel right-panel" id="rightPanel">

        <div id="rightDefault">
          <h2>How verification works</h2>
          <p>
            docuProof creates a <strong>cryptographic fingerprint</strong> of your file.
            This fingerprint is unique &mdash; even changing a single pixel or character creates a completely different one.
          </p>
          <p>
            This fingerprint is anchored into the <strong>Bitcoin blockchain</strong>,
            the most secure and permanent public ledger in existence. Once confirmed, it can never be altered or removed.
          </p>
          <p>
            <strong>What&rsquo;s stored on the blockchain:</strong> Only the fingerprint and timestamp.
            Your actual file stays private on your device &mdash; we never see it.
          </p>
          <p>
            <strong>Why it matters:</strong> This is permanent, tamper-proof evidence that your file existed
            at this exact moment. It holds up in court, resolves IP disputes, and can&rsquo;t be faked by anyone.
          </p>
        </div>

        <div id="rightLoaded" style="display:none;">

          <div class="right-proof-id">
            <div class="rpi-label">Your Proof ID &mdash; save this</div>
            <div class="rpi-value" id="rightProofId"></div>
            <div class="rpi-hint">Click to copy &middot; This is your key to find your proof on the blockchain</div>
          </div>

          <div class="blockchain-visual" id="blockchainVisual">
            <div class="bv-label">See your proof on the blockchain</div>
            <div id="bvContent">
              <p class="bv-pending">Your proof is being anchored. Once confirmed (1&ndash;3 hours),
              you&rsquo;ll see a live link here to view it on the Bitcoin blockchain.</p>
            </div>
          </div>

          <div class="cert-teaser">
            <img src="/docuProof-Certificate-Screenshot.png" 
                 onerror="this.style.display='none';this.nextElementSibling.style.display='block';"
                 alt="docuProof Certificate of Proof of Existence" />
            <div style="display:none;padding:32px 20px;text-align:center;background:#1a1f24;">
              <div style="font-size:48px;margin-bottom:12px;">&#x1f4dc;</div>
              <div style="font-size:16px;font-weight:700;color:#22c55e;">Certificate of Proof of Existence</div>
              <div style="font-size:13px;color:#8b949e;margin-top:6px;">Includes Proof ID, SHA-256 hash, blockchain block, QR code, and legal attestation</div>
            </div>
            <div class="cert-teaser-label">
              Paid proofs include a PDF Certificate of Proof of Existence
            </div>
            <div class="cert-teaser-sublabel">
              Court-ready documentation with QR verification, blockchain details, and legal attestation.
              <a href="/app.html">Generate a paid proof &rarr;</a>
            </div>
          </div>

        </div>

      </section>

    </div>
  </div>
</main>

<footer class="footer">
  <div class="shell">
    &copy; ${yr} docuProof.io &mdash; Bitcoin-anchored proof of existence
  </div>
</footer>

<div class="toast" id="shareToast"></div>

<script>
(function(){
  var input = document.getElementById("proof-id");
  var btn = document.getElementById("btn-check");
  var pill = document.getElementById("pill-state");
  var fieldState = document.getElementById("anchor-state");
  var fieldBlock = document.getElementById("bitcoin-block");
  var fieldConf = document.getElementById("confirmations");
  var shareSection = document.getElementById("shareSection");
  var statusFields = document.getElementById("statusFields");
  var explainerBox = document.getElementById("explainerBox");
  var emailSection = document.getElementById("emailSection");
  var rightDefault = document.getElementById("rightDefault");
  var rightLoaded = document.getElementById("rightLoaded");
  var rightProofId = document.getElementById("rightProofId");
  var bvContent = document.getElementById("bvContent");
  var emailBtn = document.getElementById("emailBtn");
  var currentProofId = "";

  // Share infrastructure
  var sharePopover = document.getElementById("sharePopover");
  var shareToast = document.getElementById("shareToast");
  var pendingAction = "";
  var sharePages = {
    "business":      "https://docuproof.io/business.html",
    "personal":      "https://docuproof.io/personal.html",
    "verify-truth":  "https://docuproof.io/verify-truth.html",
    "tech":          "https://docuproof.io/launch.html",
    "general":       "https://docuproof.io/start.html"
  };
  var shareText = "I just timestamped a file on the Bitcoin blockchain with docuProof \\u2014 permanent, tamper-proof proof of existence.";

  window._shareOpen = function(e, action) {
    e.stopPropagation();
    pendingAction = action;
    var btnEl = e.currentTarget;
    var rect = btnEl.getBoundingClientRect();
    var container = btnEl.parentElement.getBoundingClientRect();
    sharePopover.style.left = Math.max(0, rect.left - container.left) + "px";
    sharePopover.classList.add("show");
  };

  window._shareGo = function(page) {
    var url = sharePages[page];
    sharePopover.classList.remove("show");

    if (pendingAction === "copy") {
      navigator.clipboard.writeText(url).then(function() {
        showToast("\\u2713 Link copied!");
      });
    } else if (pendingAction === "twitter") {
      var tweetUrl = "https://twitter.com/intent/tweet?text=" + encodeURIComponent(shareText) + "&url=" + encodeURIComponent(url);
      window.open(tweetUrl, "_blank", "width=550,height=420");
    } else if (pendingAction === "linkedin") {
      var liUrl = "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url);
      window.open(liUrl, "_blank", "width=550,height=420");
    } else if (pendingAction === "email") {
      var subject = encodeURIComponent("Check out docuProof \\u2014 blockchain-anchored proof of existence");
      var body = encodeURIComponent(shareText + "\\n\\n" + url);
      window.location.href = "mailto:?subject=" + subject + "&body=" + body;
    }

    pendingAction = "";
  };

  function showToast(msg) {
    shareToast.textContent = msg;
    shareToast.classList.add("show");
    setTimeout(function() { shareToast.classList.remove("show"); }, 2500);
  }

  // Close popover when clicking outside
  document.addEventListener("click", function(e) {
    if (!e.target.closest(".share-buttons")) {
      sharePopover.classList.remove("show");
    }
  });

  function resetFields() {
    fieldState.textContent = "\\u2014";
    fieldBlock.innerHTML = "\\u2014";
    fieldConf.textContent = "\\u2014";
  }

  function showProofLoaded(id) {
    currentProofId = id;
    shareSection.style.display = "block";
    statusFields.style.display = "block";
    explainerBox.style.display = "block";
    // emailSection visibility is now controlled by updateEmailSection()
    emailSection.style.display = "block";
    rightDefault.style.display = "none";
    rightLoaded.style.display = "block";
    rightProofId.textContent = id;
  }

  // Show the right email section variant based on paid status
  function updateEmailSection(isPaid) {
    var paidContent = document.getElementById("emailPaidContent");
    var freeContent = document.getElementById("emailFreeContent");
    if (isPaid) {
      paidContent.style.display = "block";
      freeContent.style.display = "none";
    } else {
      paidContent.style.display = "none";
      freeContent.style.display = "block";
    }
  }

  function showNotFound() {
    pill.className = "pill pill-error";
    pill.textContent = "Proof not found";
    fieldState.textContent = "No record found";
    fieldBlock.innerHTML = "\\u2014";
    fieldConf.textContent = "\\u2014";
  }

  function showPending() {
    pill.className = "pill pill-pending";
    pill.textContent = "\\u23f3 Pending blockchain confirmation";
    fieldState.textContent = "Queued for anchoring";
    fieldBlock.innerHTML = "Awaiting confirmation";
    fieldConf.textContent = "\\u2014";
    bvContent.innerHTML = '<p class="bv-pending">Your proof is being anchored to the Bitcoin blockchain. Once a miner confirms the transaction (typically 1\\u20133 hours), a live link will appear here so you can see it on the actual blockchain.</p>';
  }

  function showAnchored(d) {
    pill.className = "pill pill-success";
    pill.textContent = "\\u2713 Anchored on the Bitcoin blockchain";
    fieldState.textContent = "Confirmed";
    fieldConf.textContent = d.confirmations != null ? d.confirmations : "\\u2014";

    var block = d.blockHeight || d.block;
    if (block) {
      fieldBlock.innerHTML =
        '<a class="block-link" href="https://mempool.space/block/' + block + '" target="_blank">' + block + '</a>' +
        ' \\u00b7 <a class="block-link" href="https://blockstream.info/block/' + block + '" target="_blank">blockstream</a>';

      bvContent.innerHTML =
        '<a class="bv-link" href="https://mempool.space/block/' + block + '" target="_blank" rel="noopener">' +
        '\\ud83d\\udd17 View Bitcoin Block #' + block + ' on Mempool.space</a>' +
        '<p style="margin-top:10px;font-size:12px;color:#8b949e;">This is the actual Bitcoin block where your proof is permanently recorded. Anyone can independently verify it.</p>';
    } else if (d.txid) {
      var tx = d.txid;
      var short = tx.slice(0,10) + "\\u2026" + tx.slice(-6);
      fieldBlock.innerHTML =
        '<a class="block-link" href="https://mempool.space/tx/' + tx + '" target="_blank">' + short + '</a>';
      bvContent.innerHTML =
        '<a class="bv-link" href="https://mempool.space/tx/' + tx + '" target="_blank" rel="noopener">' +
        '\\ud83d\\udd17 View Transaction on Mempool.space</a>';
    }
  }

  async function check(id) {
    if (!id) {
      pill.className = "pill pill-waiting";
      pill.textContent = "Enter a Proof ID above";
      resetFields();
      return;
    }

    pill.className = "pill pill-waiting";
    pill.textContent = "Checking\\u2026";
    resetFields();
    showProofLoaded(id);

    // Default: use URL hint for immediate display, then override with server data
    var isPaid = ${sourcePaid ? 'true' : 'false'};

    // Heuristic: free proofs typically start with "free_"; paid proofs are 12-char hex IDs
    if (!isPaid && id && !id.startsWith("free_")) {
      isPaid = true;
    }

    try {
      var r = await fetch("/.netlify/functions/anchor_status?id=" + encodeURIComponent(id));
      var d = await r.json();

      if (!r.ok || !d.ok) { showNotFound(); return; }

      // Check if proof has a customerEmail (indicates paid proof)
      if (d.isPaid === true || d.customerEmail) {
        isPaid = true;
      }

      var state = (d.state || "").toUpperCase();
      var blockHeight = d.blockHeight || d.block || 0;

      if (state === "ANCHORED" && blockHeight > 0) {
        showAnchored(d);
      } else if (state === "NOT_FOUND" || state === "ERROR") {
        showNotFound();
      } else {
        showPending();
      }
    } catch (err) {
      console.error("Check error:", err);
      showNotFound();
    }

    updateEmailSection(isPaid);
  }

  // Right panel proof ID click to copy
  rightProofId.addEventListener("click", function() {
    if (!currentProofId) return;
    navigator.clipboard.writeText(currentProofId).then(function() {
      showToast("\\u2713 Proof ID copied!");
    });
  });

  // Email capture (only present for non-paid flows)
  if (emailBtn) {
  emailBtn.addEventListener("click", async function() {
    var emailInput = document.getElementById("emailInput");
    var emailRow = document.getElementById("emailRow");
    var emailSuccess = document.getElementById("emailSuccess");

    var email = emailInput.value.trim();
    if (!email || !email.includes("@")) {
      emailInput.style.borderColor = "#ef4444";
      return;
    }

    emailBtn.disabled = true;
    emailBtn.textContent = "Sending\\u2026";

    try {
      var res = await fetch("/.netlify/functions/capture_email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          proofId: currentProofId,
          source: currentProofId.startsWith("free_") ? "free" : "paid"
        })
      });
      var data = await res.json();
      if (data.ok) {
        emailRow.style.display = "none";
        emailSuccess.style.display = "block";
      } else {
        throw new Error(data.error || "Failed");
      }
    } catch (err) {
      console.error("Email capture error:", err);
      emailBtn.disabled = false;
      emailBtn.textContent = "Send";
      emailInput.style.borderColor = "#ef4444";
    }
  });
  } // end if(emailBtn)

  // Check button + Enter key
  btn.addEventListener("click", function() { check(input.value.trim()); });
  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") check(input.value.trim());
  });

  // Auto-check if ID provided in URL
  if (input.value && input.value.trim()) {
    check(input.value.trim());
  }
})();
</script>

</body>
</html>`;
}
