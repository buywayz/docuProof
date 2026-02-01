"use strict";

/*
  netlify/functions/verify_page.js  v2.1.0

  Serves the Verify UI and calls JSON endpoints:
  - /.netlify/functions/anchor_status?id=...
*/

exports.handler = async (event) => {
  const rawUrl =
    event.rawUrl ||
    ("https://docuproof.local" + (event.path || "/verify"));

  let initialId = "";

  try {
    const url = new URL(rawUrl);
    const qsId = (url.searchParams.get("id") || "").trim();
    if (qsId) initialId = qsId;
  } catch {
    // ignore
  }

  // Support /v/:id
  if (!initialId && event.path) {
    const parts = event.path.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    // Don't use "verify" as an ID
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
    body: buildHtml(initialId),
  };
};

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(initialId) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Verify • docuProof</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="/docuproof-logo.png">

<style>
:root {
  --bg: #0a0d10;
  --card: #12161c;
  --border: #21262d;
  --text: #e8eaed;
  --muted: #8b949e;
  --accent: #22c55e;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}

.shell {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
}

/* Header - matches other pages */
.header {
  border-bottom: 1px solid var(--border);
  padding: 16px 0;
  margin-bottom: 48px;
}

.header-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  display: flex;
  gap: 12px;
  align-items: center;
  text-decoration: none;
  color: var(--text);
}

.logo img {
  width: 36px;
  height: 36px;
}

.logo-text {
  line-height: 1.2;
}

.logo-title {
  font-weight: 700;
  font-size: 18px;
}

.logo-sub {
  font-size: 11px;
  letter-spacing: .08em;
  color: var(--muted);
  text-transform: uppercase;
}

.btn-primary {
  background: var(--accent);
  color: #0a0d10;
  border: none;
  padding: 12px 24px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  text-decoration: none;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #1ea550;
}

/* Main content */
.content {
  padding-bottom: 60px;
}

.layout {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 24px;
}

@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
}

.panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 28px;
}

.panel h1 {
  font-size: 26px;
  font-weight: 700;
  margin-bottom: 12px;
}

.panel > p {
  color: var(--muted);
  margin-bottom: 24px;
  font-size: 16px;
  line-height: 1.5;
}

.label {
  font-size: 11px;
  letter-spacing: .12em;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 8px;
}

.input-row {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}

input {
  flex: 1;
  border-radius: 12px;
  padding: 14px 18px;
  background: #1a1f24;
  border: 1px solid var(--border);
  color: var(--text);
  font-size: 16px;
  outline: none;
}

input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.15);
}

input::placeholder {
  color: #6b7280;
}

/* Pills */
.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 20px;
}

.pill-waiting {
  background: #1a1f24;
  color: var(--muted);
  border: 1px solid var(--border);
}

.pill-pending {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #000;
}

.pill-success {
  background: linear-gradient(135deg, #22c55e, #16a34a);
  color: #000;
}

.pill-error {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: #fff;
}

/* Fields */
.field {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 14px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.field:last-of-type {
  border-bottom: none;
}

.field-label {
  font-size: 11px;
  letter-spacing: .12em;
  color: var(--muted);
  text-transform: uppercase;
}

.field-value {
  text-align: right;
  color: var(--text);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
}

.block-link {
  color: var(--accent);
  text-decoration: none;
}

.block-link:hover {
  text-decoration: underline;
}

.txid-full {
  font-size: 11px;
  color: var(--muted);
  margin-top: 6px;
  word-break: break-all;
}

.court-panel {
  margin-top: 24px;
  border-top: 1px dashed rgba(255,255,255,.12);
  padding-top: 20px;
  font-size: 14px;
  line-height: 1.6;
  color: #c9d2db;
}

.court-panel strong {
  color: var(--text);
}

/* Right panel */
.info-panel h1 {
  margin-bottom: 16px;
}

.info-panel p {
  color: #c9d2db;
  line-height: 1.7;
  margin-bottom: 16px;
}

.info-panel strong {
  color: var(--accent);
}

/* Footer */
.footer {
  text-align: center;
  font-size: 13px;
  color: var(--muted);
  padding: 24px 0;
  border-top: 1px solid var(--border);
  margin-top: 48px;
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
      <a href="/start.html" class="btn-primary">Start · Generate</a>
    </div>
  </div>
</header>

<main class="content">
  <div class="shell">
    <div class="layout">

      <section class="panel">
        <h1>Check a timestamped proof</h1>
        <p>Paste the <strong>Proof ID</strong> from your certificate.</p>

        <div class="label">Proof ID</div>
        <div class="input-row">
          <input id="proof-id" value="${esc(initialId)}" placeholder="e.g. cs_live_... or free_abc123..." />
          <button id="btn-check" class="btn-primary">Check status</button>
        </div>

        <div id="pill-state" class="pill pill-waiting">Enter a Proof ID above</div>

        <div class="field">
          <div class="field-label">Anchor State</div>
          <div id="anchor-state" class="field-value">—</div>
        </div>

        <div class="field">
          <div class="field-label">Bitcoin Block</div>
          <div id="bitcoin-block" class="field-value">—</div>
        </div>

        <div class="field">
          <div class="field-label">Confirmations</div>
          <div id="confirmations" class="field-value">—</div>
        </div>

        <div class="court-panel">
          <strong>Court-facing verification</strong><br/>
          This record indicates that a SHA-256 hash was timestamped and anchored
          into the Bitcoin blockchain. This supports that a file with that hash
          existed no later than the block confirmation time, subject to standard
          Bitcoin and OpenTimestamps security assumptions.
        </div>
      </section>

      <section class="panel info-panel">
        <h1>How verification works</h1>
        <p>
          docuProof stores only a cryptographic fingerprint and a timestamp receipt.
          Independent verification is performed via the Bitcoin blockchain and the OpenTimestamps protocol.
        </p>
        <p>
          <strong>Pending proofs:</strong> After creation, proofs are queued for blockchain anchoring. This typically takes 1-3 hours as transactions are batched and confirmed by Bitcoin miners.
        </p>
        <p>
          <strong>Anchored proofs:</strong> Once confirmed, your proof is permanently recorded on the Bitcoin blockchain and can be independently verified forever.
        </p>
      </section>

    </div>
  </div>
</main>

<footer class="footer">
  <div class="shell">
    © 2026 docuProof.io — Bitcoin-anchored proof of existence
  </div>
</footer>

<script>
(function(){
  const input = document.getElementById("proof-id");
  const btn = document.getElementById("btn-check");
  const pill = document.getElementById("pill-state");
  const fieldState = document.getElementById("anchor-state");
  const fieldBlock = document.getElementById("bitcoin-block");
  const fieldConf = document.getElementById("confirmations");

  function resetFields() {
    fieldState.textContent = "—";
    fieldBlock.innerHTML = "—";
    fieldConf.textContent = "—";
  }

  function showNotFound() {
    pill.className = "pill pill-error";
    pill.textContent = "Proof not found";
    fieldState.textContent = "No record found";
    fieldBlock.innerHTML = "—";
    fieldConf.textContent = "—";
  }

  function showPending() {
    pill.className = "pill pill-pending";
    pill.textContent = "⏳ Pending blockchain confirmation";
    fieldState.textContent = "Queued for anchoring";
    fieldBlock.innerHTML = "Awaiting confirmation";
    fieldConf.textContent = "—";
  }

  function showAnchored(d) {
    pill.className = "pill pill-success";
    pill.textContent = "✓ Anchored on the Bitcoin blockchain";
    fieldState.textContent = "Confirmed";
    fieldConf.textContent = d.confirmations ?? "—";

    // Show block with links
    const block = d.blockHeight || d.block;
    if (block) {
      fieldBlock.innerHTML = 
        '<a class="block-link" href="https://mempool.space/block/' + block + '" target="_blank">' + block + '</a>' +
        ' · <a class="block-link" href="https://blockstream.info/block/' + block + '" target="_blank">blockstream</a>';
    } else if (d.txid) {
      const tx = d.txid;
      const short = tx.slice(0,10) + "…" + tx.slice(-6);
      fieldBlock.innerHTML = 
        '<a class="block-link" href="https://mempool.space/tx/' + tx + '" target="_blank">' + short + '</a>' +
        '<div class="txid-full">' + tx + '</div>';
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
    pill.textContent = "Checking…";
    resetFields();

    try {
      const r = await fetch("/.netlify/functions/anchor_status?id=" + encodeURIComponent(id));
      const d = await r.json();

      if (!r.ok || !d.ok) {
        showNotFound();
        return;
      }

      // Check the state
      const state = (d.state || "").toUpperCase();
      const blockHeight = d.blockHeight || d.block || 0;

      if (state === "ANCHORED" && blockHeight > 0) {
        showAnchored(d);
      } else if (state === "NOT_FOUND" || state === "ERROR") {
        showNotFound();
      } else {
        // PENDING, OTS_RECEIPT, or anchored without block height
        showPending();
      }

    } catch (err) {
      console.error("Check error:", err);
      showNotFound();
    }
  }

  btn.onclick = () => check(input.value.trim());
  
  // Auto-check if ID provided
  if (input.value && input.value.trim()) {
    check(input.value.trim());
  }
})();
</script>

</body>
</html>`;
}
