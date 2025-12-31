"use strict";

/*
  netlify/functions/verify_page.js

  Serves the Verify UI and calls JSON endpoints:
  - /.netlify/functions/anchor_status?id=...
  - /.netlify/functions/download_receipt?id=...
  - /.netlify/functions/download_receipt_json?id=...

  Supports:
  - /verify?id=PROOF_ID
  - /v/PROOF_ID
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
    if (last && !last.includes("?")) initialId = last;
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

<style>
:root {
  --bg: #020714;
  --panel: #050b1d;
  --panel-soft: #070f22;
  --border: #151b2e;
  --text: #f7f9ff;
  --muted: #9aa4c4;
  --accent: #16ff70;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: radial-gradient(circle at top, #061227 0, #01030a 55%);
  color: var(--text);
}

.shell {
  max-width: 1120px;
  margin: 0 auto;
  padding: 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22px;
}

.logo {
  display: flex;
  gap: 12px;
  align-items: center;
}

.logo-glyph {
  width: 32px;
  height: 32px;
  background: center/contain no-repeat url("/.netlify/functions/logo_static");
}

.logo-text {
  line-height: 1.2;
}

.logo-title {
  font-weight: 650;
}

.logo-sub {
  font-size: 11px;
  letter-spacing: .14em;
  color: var(--muted);
  text-transform: uppercase;
}

.btn-primary {
  background: var(--accent);
  color: #020513;
  border: none;
  padding: 10px 20px;
  border-radius: 999px;
  font-weight: 600;
  cursor: pointer;
}

.layout {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 22px;
}

@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
}

.panel {
  background: linear-gradient(145deg, var(--panel), var(--panel-soft));
  border: 1px solid var(--border);
  border-radius: 22px;
  padding: 22px;
}

.panel h1 {
  margin-top: 0;
  font-size: 22px;
}

.label {
  font-size: 11px;
  letter-spacing: .16em;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 6px;
}

.input-row {
  display: flex;
  gap: 10px;
}

input {
  flex: 1;
  border-radius: 999px;
  padding: 10px 14px;
  background: #0b1124;
  border: 1px solid var(--border);
  color: var(--text);
}

.pill {
  display: inline-flex;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: .14em;
  border: 1px solid rgba(255,255,255,.08);
}

.pill-success {
  background: linear-gradient(135deg, #16ff70, #16ffab);
  color: #020513;
  font-weight: 600;
}

.field {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-top: 10px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.txid-block {
  text-align: right;
}

.txid-block a {
  color: #7bf8b9;
}

.txid-full {
  font-size: 12px;
  color: var(--muted);
  margin-top: 6px;
}

.court-panel {
  margin-top: 20px;
  border-top: 1px dashed rgba(255,255,255,.12);
  padding-top: 16px;
  font-size: 13px;
  line-height: 1.5;
}

.footer {
  text-align: center;
  font-size: 11px;
  color: var(--muted);
  margin-top: 24px;
}
</style>
</head>

<body>
<div class="shell">

<header class="header">
  <div class="logo">
    <div class="logo-glyph"></div>
    <div class="logo-text">
      <div class="logo-title">docuProof</div>
      <div class="logo-sub">Proof you can point to.</div>
    </div>
  </div>
  <a href="/start" class="btn-primary">Start · Generate</a>
</header>

<main class="layout">

<section class="panel">
  <h1>Check a timestamped proof</h1>
  <p>Paste the <strong>Proof ID</strong> from your certificate.</p>

  <div class="label">Proof ID</div>
  <div class="input-row">
    <input id="proof-id" value="${esc(initialId)}" />
    <button id="btn-check" class="btn-primary">Check status</button>
  </div>

  <div id="pill-state" class="pill" style="margin-top:14px;">Waiting for proof</div>

  <div class="field">
    <div class="label">Anchor state</div>
    <div id="anchor-state">—</div>
  </div>

  <div class="field">
    <div class="label">Bitcoin txid</div>
    <div id="bitcoin-txid" class="mono">—</div>
  </div>

  <div class="field">
    <div class="label">Confirmations</div>
    <div id="confirmations">—</div>
  </div>

  <div class="court-panel">
    <strong>Court-facing verification</strong><br/>
    This record indicates that a SHA-256 hash was timestamped and anchored
    into the Bitcoin blockchain. This supports that a file with that hash
    existed no later than the block confirmation time, subject to standard
    Bitcoin and OpenTimestamps security assumptions.
  </div>
</section>

<section class="panel">
  <h1>How verification works</h1>
  <p>
    docuProof stores only a cryptographic fingerprint and a timestamp receipt.
    Independent verification is performed via public Bitcoin block explorers
    and the OpenTimestamps protocol.
  </p>
</section>

</main>

<footer class="footer">
© 2025 docuProof.io — Bitcoin-anchored proof of existence
</footer>

</div>

<script>
(function(){
  const input = document.getElementById("proof-id");
  const btn = document.getElementById("btn-check");
  const pill = document.getElementById("pill-state");
  const fieldState = document.getElementById("anchor-state");
  const fieldTxid = document.getElementById("bitcoin-txid");
  const fieldConf = document.getElementById("confirmations");

  async function check(id){
    pill.textContent = "Checking…";
    const r = await fetch("/.netlify/functions/anchor_status?id="+encodeURIComponent(id));
    const d = await r.json();

    pill.className = "pill pill-success";
    pill.textContent = "Anchored on the Bitcoin blockchain";

    fieldState.textContent = d.state || "—";
    fieldConf.textContent = d.confirmations ?? "0";

    if (d.txid) {
      const tx = d.txid;
      const short = tx.slice(0,12)+"…"+tx.slice(-6);
      fieldTxid.innerHTML =
        '<div class="txid-block">' +
          '<a href="https://mempool.space/tx/'+tx+'" target="_blank">'+short+'</a>' +
          '<div class="txid-full">'+tx+'</div>' +
          '<div class="txid-full">Also view on <a href="https://blockstream.info/tx/'+tx+'" target="_blank">blockstream.info</a></div>' +
        '</div>';
    }
  }

  btn.onclick = () => check(input.value.trim());
  if (input.value) check(input.value);
})();
</script>

</body>
</html>`;
}