"use strict";

/*
  netlify/functions/verify_page.js  v3.0.0

  Redesigned verify/proof status page with:
  - Email capture for prospect database
  - Blockchain explainer (what the hash is, what's on the blockchain)
  - Mempool.space link to visually see the proof
  - Certificate teaser for paid upsell
  - Copyable Proof ID
  - Works for both free and paid flows
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

/* Proof ID box */
.proof-id-box {
  background: #1a1f24; border: 1px solid var(--border); border-radius: 12px;
  padding: 14px 18px; margin-bottom: 16px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
}
.proof-id-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 15px; color: var(--accent); word-break: break-all;
}
.copy-btn {
  background: none; border: 1px solid var(--border); border-radius: 8px;
  padding: 6px 12px; color: var(--muted); font-size: 12px;
  cursor: pointer; white-space: nowrap; transition: all 0.2s;
}
.copy-btn:hover { border-color: var(--accent); color: var(--accent); }
.copy-btn.copied { border-color: var(--accent); color: var(--accent); }

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

/* Email capture */
.email-section {
  margin-top: 20px; padding-top: 20px;
  border-top: 1px dashed rgba(255,255,255,0.1);
}
.email-section h3 { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
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
  background: var(--accent); color: #0a0d10; border: none;
  padding: 12px 20px; border-radius: 10px; font-weight: 700;
  font-size: 14px; cursor: pointer; white-space: nowrap; transition: background 0.2s;
}
.email-row button:hover { background: var(--accent-hover); }
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
  font-size: 11px; letter-spacing: .1em; color: var(--muted);
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

        <div id="proofIdDisplay" style="display:none;">
          <div class="section-title">Your Proof ID</div>
          <div class="proof-id-box">
            <span class="proof-id-value" id="proofIdValue"></span>
            <button class="copy-btn" id="copyBtn">Copy</button>
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
          <h3>Don&rsquo;t lose your proof</h3>
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

<script>
(function(){
  var input = document.getElementById("proof-id");
  var btn = document.getElementById("btn-check");
  var pill = document.getElementById("pill-state");
  var fieldState = document.getElementById("anchor-state");
  var fieldBlock = document.getElementById("bitcoin-block");
  var fieldConf = document.getElementById("confirmations");
  var proofIdDisplay = document.getElementById("proofIdDisplay");
  var proofIdValue = document.getElementById("proofIdValue");
  var statusFields = document.getElementById("statusFields");
  var explainerBox = document.getElementById("explainerBox");
  var emailSection = document.getElementById("emailSection");
  var rightDefault = document.getElementById("rightDefault");
  var rightLoaded = document.getElementById("rightLoaded");
  var rightProofId = document.getElementById("rightProofId");
  var bvContent = document.getElementById("bvContent");
  var copyBtn = document.getElementById("copyBtn");
  var emailBtn = document.getElementById("emailBtn");
  var currentProofId = "";

  function resetFields() {
    fieldState.textContent = "\\u2014";
    fieldBlock.innerHTML = "\\u2014";
    fieldConf.textContent = "\\u2014";
  }

  function showProofLoaded(id) {
    currentProofId = id;
    proofIdValue.textContent = id;
    proofIdDisplay.style.display = "block";
    statusFields.style.display = "block";
    explainerBox.style.display = "block";
    emailSection.style.display = "block";
    rightDefault.style.display = "none";
    rightLoaded.style.display = "block";
    rightProofId.textContent = id;
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

    try {
      var r = await fetch("/.netlify/functions/anchor_status?id=" + encodeURIComponent(id));
      var d = await r.json();

      if (!r.ok || !d.ok) { showNotFound(); return; }

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
  }

  // Copy proof ID
  function doCopy() {
    if (!currentProofId) return;
    navigator.clipboard.writeText(currentProofId).then(function() {
      copyBtn.textContent = "Copied!";
      copyBtn.classList.add("copied");
      setTimeout(function() {
        copyBtn.textContent = "Copy";
        copyBtn.classList.remove("copied");
      }, 2000);
    });
  }

  copyBtn.addEventListener("click", doCopy);
  rightProofId.addEventListener("click", doCopy);

  // Email capture
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
