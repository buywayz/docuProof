"use strict";

// netlify/functions/verify_page.js
// Serves the Verify UI and calls JSON endpoints:
// - /.netlify/functions/anchor_status?id=...
// - /.netlify/functions/download_receipt?id=...
// - /.netlify/functions/download_receipt_json?id=...
// - /.netlify/functions/verify (optional hash check via POST)

exports.handler = async (event) => {
  const rawUrl = event.rawUrl || "http://x/";
  let initialId = "";

  try {
    const url = new URL(rawUrl);
    const qsId = (url.searchParams.get("id") || "").trim();
    if (qsId) initialId = qsId;
  } catch (_) {
    // ignore
  }

  // Also support /v/:id form
  if (!initialId && event.path) {
    const parts = event.path.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    if (last && !last.includes("?")) initialId = last;
  }

  const html = buildHtml(initialId);
  return {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
    body: html,
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
  const safeId = esc(initialId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Verify a Proof • docuProof</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      --bg: #050609;
      --bg-elevated: #0d1016;
      --border-subtle: #242633;
      --accent: #16ff70;
      --accent-soft: rgba(22, 255, 112, 0.08);
      --accent-strong: rgba(22, 255, 112, 0.16);
      --text-main: #f9fafb;
      --text-muted: #9ca3af;
      --text-soft: #6b7280;
      --danger: #f97373;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      --radius-lg: 16px;
      --radius-pill: 999px;
      --shadow-soft: 0 24px 60px rgba(0, 0, 0, 0.8);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at top, #101520 0, #050609 52%, #030304 100%);
      color: var(--text-main);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      display: flex;
      justify-content: center;
      align-items: stretch;
      padding: 24px;
    }

    .frame {
      width: 100%;
      max-width: 1080px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .brand-mark {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: radial-gradient(circle at 30% 30%, var(--accent) 0, #0bff47 18%, #012e14 45%, #010509 100%);
      box-shadow: 0 0 0 1px rgba(22, 255, 112, 0.3), 0 0 32px rgba(22, 255, 112, 0.4);
    }

    .brand-text-main {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }

    .brand-text-sub {
      font-size: 11px;
      color: var(--text-soft);
    }

    .header-cta {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .badge {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--accent-soft);
      color: var(--accent);
      background: var(--accent-soft);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 12px var(--accent);
    }

    .btn-outline {
      font-size: 12px;
      padding: 6px 14px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      background: transparent;
      cursor: pointer;
    }

    .btn-outline:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .shell {
      border-radius: 24px;
      background: radial-gradient(circle at top left, rgba(22, 255, 112, 0.06) 0, rgba(1, 4, 9, 0.96) 48%, #020409 100%);
      border: 1px solid rgba(148, 163, 184, 0.15);
      box-shadow: var(--shadow-soft);
      padding: 20px 22px;
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.1fr);
      gap: 18px;
      align-items: flex-start;
    }

    @media (max-width: 880px) {
      body {
        padding: 16px;
      }
      .shell {
        grid-template-columns: minmax(0, 1fr);
      }
      .header-row {
        flex-direction: column;
        align-items: flex-start;
      }
      .header-cta {
        align-self: stretch;
        justify-content: space-between;
        width: 100%;
      }
    }

    .panel {
      padding: 16px 18px;
      border-radius: 18px;
      background: radial-gradient(circle at top, rgba(15, 23, 42, 0.9) 0, rgba(15, 23, 42, 0.72) 45%, rgba(15, 23, 42, 0.88) 100%);
      border: 1px solid rgba(148, 163, 184, 0.4);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.65);
    }

    .panel-heading {
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.13em;
      color: var(--text-soft);
      margin-bottom: 4px;
    }

    .panel-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 6px;
    }

    .panel-sub {
      font-size: 12px;
      color: var(--text-muted);
      max-width: 30rem;
    }

    .form-row {
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    label {
      font-size: 11px;
      color: var(--text-soft);
      text-transform: uppercase;
      letter-spacing: 0.12em;
    }

    .input-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 9px 11px;
      font-size: 13px;
      border-radius: var(--radius-pill);
      border: 1px solid var(--border-subtle);
      background: rgba(15, 23, 42, 0.85);
      color: var(--text-main);
      font-family: var(--mono);
      outline: none;
    }

    .input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 1px rgba(22, 255, 112, 0.3);
    }

    .btn-primary {
      flex: 0 0 auto;
      padding: 9px 16px;
      font-size: 13px;
      font-weight: 500;
      border-radius: var(--radius-pill);
      border: none;
      background: linear-gradient(135deg, var(--accent), #5bff9c);
      color: #020617;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    .btn-primary:hover {
      filter: brightness(1.05);
    }

    .btn-primary:disabled {
      opacity: 0.65;
      cursor: default;
    }

    .btn-primary-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: #020617;
    }

    .hint {
      font-size: 11px;
      color: var(--text-soft);
    }

    .hint code {
      font-family: var(--mono);
      font-size: 11px;
      padding: 1px 5px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.9);
      border: 1px solid rgba(148, 163, 184, 0.45);
      color: var(--text-muted);
    }

    .status-badge-row {
      margin-top: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .pill {
      font-size: 11px;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      border: 1px solid rgba(148, 163, 184, 0.4);
      color: var(--text-muted);
      background: rgba(15, 23, 42, 0.85);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .pill-anchored {
      border-color: rgba(22, 255, 112, 0.7);
      background: var(--accent-soft);
      color: var(--accent);
    }

    .pill-pending {
      border-color: rgba(234, 179, 8, 0.7);
      background: rgba(234, 179, 8, 0.07);
      color: #facc15;
    }

    .pill-failed {
      border-color: rgba(248, 113, 113, 0.7);
      background: rgba(248, 113, 113, 0.07);
      color: var(--danger);
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
    }

    .dot-anchored {
      background: var(--accent);
      box-shadow: 0 0 10px var(--accent);
    }

    .dot-pending {
      background: #facc15;
      box-shadow: 0 0 10px #facc15;
    }

    .dot-failed {
      background: var(--danger);
      box-shadow: 0 0 10px var(--danger);
    }

    .status-table {
      margin-top: 14px;
      border-radius: 14px;
      border: 1px solid rgba(55, 65, 81, 0.9);
      background: radial-gradient(circle at top, #020617, #020617 42%, #020617 100%);
      overflow: hidden;
    }

    .status-row {
      display: grid;
      grid-template-columns: 120px minmax(0, 1fr);
      padding: 7px 11px;
      align-items: center;
      column-gap: 8px;
    }

    .status-row:nth-child(odd) {
      background: rgba(15, 23, 42, 0.9);
    }

    .status-row:nth-child(even) {
      background: rgba(17, 24, 39, 0.9);
    }

    .status-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: var(--text-soft);
    }

    .status-value {
      font-size: 13px;
      color: var(--text-main);
      word-break: break-all;
    }

    .status-value-muted {
      color: var(--text-soft);
    }

    .status-mono {
      font-family: var(--mono);
      font-size: 12px;
    }

    .link {
      color: var(--accent);
      text-decoration: none;
      font-size: 12px;
    }

    .link:hover {
      text-decoration: underline;
    }

    .dl-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .dl-pill {
      font-size: 12px;
      padding: 4px 9px;
      border-radius: var(--radius-pill);
      border: 1px dashed rgba(148, 163, 184, 0.6);
      color: var(--accent);
      background: rgba(22, 255, 112, 0.04);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .dl-pill:hover {
      border-style: solid;
      background: rgba(22, 255, 112, 0.08);
    }

    .dl-pill span {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: var(--text-soft);
    }

    .verify-note {
      margin-top: 12px;
      font-size: 11px;
      color: var(--text-soft);
    }

    .verify-note strong {
      color: var(--text-muted);
    }

    .error-box {
      margin-top: 10px;
      font-size: 11px;
      color: var(--danger);
    }

    .secondary-panel {
      padding: 16px 18px;
      border-radius: 18px;
      border: 1px dashed rgba(148, 163, 184, 0.55);
      background: radial-gradient(circle at top right, rgba(22, 255, 112, 0.03), rgba(15, 23, 42, 0.96));
    }

    .secondary-title {
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .secondary-body {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    ul {
      padding-left: 18px;
      margin: 0;
      margin-bottom: 8px;
    }

    li {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .badge-mini {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: var(--radius-pill);
      border: 1px solid rgba(148, 163, 184, 0.5);
      background: rgba(15, 23, 42, 0.9);
      color: var(--text-soft);
    }

    .badge-mini-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: rgba(148, 163, 184, 0.8);
    }
  </style>
</head>
<body>
  <main class="frame">
    <header class="header-row">
      <div class="brand">
        <div class="brand-mark"></div>
        <div>
          <div class="brand-text-main">docuProof</div>
          <div class="brand-text-sub">Proof you can point to.</div>
        </div>
      </div>
      <div class="header-cta">
        <div class="badge">
          <div class="badge-dot"></div>
          Verify on the Bitcoin blockchain
        </div>
        <a href="/start" class="btn-outline">← Back to Start</a>
      </div>
    </header>

    <section class="shell">
      <!-- Left: Verify controls + status -->
      <div class="panel">
        <div class="panel-heading">Verify</div>
        <div class="panel-title">Check a timestamped proof</div>
        <p class="panel-sub">
          Paste the <strong>Proof ID</strong> from your docuProof certificate.  
          You&#8217;ll see its anchor status on the Bitcoin blockchain and can download the underlying timestamp receipt.
        </p>

        <div class="form-row">
          <label for="proof-id-input">Proof ID</label>
          <div class="input-row">
            <input
              id="proof-id-input"
              class="input"
              placeholder="e.g. anchor-demo-001"
              autocomplete="off"
              value="${safeId}"
            />
            <button id="btn-check" class="btn-primary">
              <span class="btn-primary-dot"></span>
              <span id="btn-check-label">Check status</span>
            </button>
          </div>
          <div class="hint">
            You can also bookmark links like
            <code>/v/&lt;id&gt;</code> or <code>/verify?id=&lt;id&gt;</code>.
          </div>
        </div>

        <div class="status-badge-row">
          <div id="status-pill" class="pill status-value-muted">
            <div id="status-pill-dot" class="dot"></div>
            <span id="status-pill-text">Waiting for a Proof ID…</span>
          </div>
          <div id="status-extra" class="pill status-value-muted" style="display:none;"></div>
        </div>

        <div class="status-table" id="status-table">
          <div class="status-row">
            <div class="status-label">Proof ID</div>
            <div class="status-value status-mono" id="field-proof-id">—</div>
          </div>
          <div class="status-row">
            <div class="status-label">Anchor state</div>
            <div class="status-value" id="field-state">—</div>
          </div>
          <div class="status-row">
            <div class="status-label">Bitcoin txid</div>
            <div class="status-value status-mono" id="field-txid">
              <span class="status-value-muted">—</span>
            </div>
          </div>
          <div class="status-row">
            <div class="status-label">Confirmations</div>
            <div class="status-value status-mono" id="field-conf">
              <span class="status-value-muted">—</span>
            </div>
          </div>
          <div class="status-row">
            <div class="status-label">Receipt</div>
            <div class="status-value">
              <div class="dl-links">
                <a id="receipt-ots-link" class="dl-pill" href="#" style="display:none;">
                  <span>OTS</span> anchor receipt
                </a>
                <a id="receipt-json-link" class="dl-pill" href="#" style="display:none;">
                  <span>JSON</span> anchor metadata
                </a>
                <span id="receipt-missing" class="status-value-muted">—</span>
              </div>
            </div>
          </div>
        </div>

        <div id="error-box" class="error-box" style="display:none;"></div>

        <div class="verify-note">
          <strong>What you&#8217;re seeing:</strong> docuProof stores your receipt and anchor metadata,
          and independently you can verify the txid and Merkle inclusion on any Bitcoin blockchain explorer.
        </div>
      </div>

      <!-- Right: Explanation panel -->
      <div class="secondary-panel">
        <div class="secondary-title">How this verification works</div>
        <p class="secondary-body">
          docuProof keeps your file private in your browser.  
          What we store is a cryptographic fingerprint (SHA-256 hash) and an
          OpenTimestamps receipt anchored to the Bitcoin blockchain.
        </p>
        <ul>
          <li><strong>Anchor state</strong> tells you whether your proof has been committed into a Bitcoin block.</li>
          <li>
            <strong>Bitcoin txid</strong> is the transaction you can inspect on any public Bitcoin blockchain explorer.
          </li>
          <li>
            <strong>OTS receipt</strong> is the portable proof file.  
            You can independently verify it with the open-source OpenTimestamps tools.
          </li>
        </ul>
        <p class="secondary-body">
          For strict evidentiary use, keep these together:
        </p>
        <ul>
          <li>Your original file (unchanged)</li>
          <li>Your docuProof PDF certificate</li>
          <li>The downloaded <code>.ots</code> receipt file</li>
        </ul>
        <div class="badge-mini">
          <div class="badge-mini-dot"></div>
          The closer you are to the original anchor date, the harder it is to dispute when the file existed.
        </div>
      </div>
    </section>
  </main>

  <script>
    (function () {
      const idInput = document.getElementById("proof-id-input");
      const btn = document.getElementById("btn-check");
      const btnLabel = document.getElementById("btn-check-label");

      const pill = document.getElementById("status-pill");
      const pillDot = document.getElementById("status-pill-dot");
      const pillText = document.getElementById("status-pill-text");
      const pillExtra = document.getElementById("status-extra");

      const fieldId = document.getElementById("field-proof-id");
      const fieldState = document.getElementById("field-state");
      const fieldTxid = document.getElementById("field-txid");
      const fieldConf = document.getElementById("field-conf");

      const receiptOts = document.getElementById("receipt-ots-link");
      const receiptJson = document.getElementById("receipt-json-link");
      const receiptMissing = document.getElementById("receipt-missing");

      const errorBox = document.getElementById("error-box");

      function setPillState(kind, text) {
        pill.classList.remove("pill-anchored", "pill-pending", "pill-failed");
        pillDot.classList.remove("dot-anchored", "dot-pending", "dot-failed");

        switch (kind) {
          case "anchored":
            pill.classList.add("pill-anchored");
            pillDot.classList.add("dot-anchored");
            break;
          case "pending":
            pill.classList.add("pill-pending");
            pillDot.classList.add("dot-pending");
            break;
          case "failed":
            pill.classList.add("pill-failed");
            pillDot.classList.add("dot-failed");
            break;
          default:
            // neutral
            break;
        }
        pillText.textContent = text;
      }

      function resetOutputs() {
        fieldId.textContent = "—";
        fieldState.textContent = "—";

        fieldTxid.innerHTML = '<span class="status-value-muted">—</span>';
        fieldConf.innerHTML = '<span class="status-value-muted">—</span>';

        receiptOts.style.display = "none";
        receiptJson.style.display = "none";
        receiptOts.removeAttribute("href");
        receiptJson.removeAttribute("href");
        receiptMissing.style.display = "inline";

        pillExtra.style.display = "none";
        pillExtra.textContent = "";

        errorBox.style.display = "none";
        errorBox.textContent = "";

        setPillState(null, "Waiting for a Proof ID…");
      }

      async function fetchAnchorStatus(id) {
        const url = "/.netlify/functions/anchor_status?id=" + encodeURIComponent(id);
        const res = await fetch(url, { method: "GET", cache: "no-store" });
        if (!res.ok) {
          throw new Error("anchor_status HTTP " + res.status);
        }
        return res.json();
      }

      /*
        Optional strict check: POST /.netlify/functions/verify
        with { id, hash } if/when you want to plug a local hash comparison into the UI.
        For now we leave this as a placeholder.
      */
      async function runCheck() {
        const id = (idInput.value || "").trim();
        if (!id) {
          resetOutputs();
          setPillState(null, "Please enter a Proof ID.");
          return;
        }

        btn.disabled = true;
        btnLabel.textContent = "Checking…";

        try {
          resetOutputs();
          fieldId.textContent = id;

          setPillState("pending", "Querying anchor status…");

          const anchor = await fetchAnchorStatus(id);

          if (!anchor || anchor.ok !== true) {
            throw new Error("Unexpected anchor_status payload");
          }

          const state = anchor.state || "UNKNOWN";
          const txid = anchor.txid || null;
          const confirmations =
            typeof anchor.confirmations === "number" ? anchor.confirmations : null;

          // --- State badge & text ---
          fieldState.textContent = state;

          if (state === "ANCHORED") {
            setPillState("anchored", "Anchored on the Bitcoin blockchain.");
          } else if (state === "OTS_RECEIPT" || state === "PENDING") {
            setPillState(
              "pending",
              "Receipt present – still upgrading to a confirmed Bitcoin anchor."
            );
          } else if (state === "NOT_FOUND") {
            setPillState("failed", "No anchor found for that Proof ID.");
          } else {
            setPillState("pending", "Status: " + state);
          }

          // --- txid display + explorer link ---
          if (txid) {
            const short = txid.slice(0, 12) + "…" + txid.slice(-8);
            const explorerUrl =
              "https://mempool.space/tx/" + encodeURIComponent(txid);

            fieldTxid.innerHTML =
              '<a class="link status-mono" href="' +
              explorerUrl +
              '" target="_blank" rel="noopener noreferrer">' +
              short +
              "</a>";
          } else {
            fieldTxid.innerHTML =
              '<span class="status-value-muted">—</span>';
          }

          // --- confirmations ---
          if (confirmations !== null && confirmations >= 0) {
            fieldConf.textContent = String(confirmations);
          } else {
            fieldConf.innerHTML =
              '<span class="status-value-muted">—</span>';
          }

          // --- receipt links ---
          // As long as the receipt exists in your blob store, these will work
          // independently of whether the txid has enough confirmations.
          const base = "/.netlify/functions";
          const otsHref =
            base + "/download_receipt?id=" + encodeURIComponent(id);
          const jsonHref =
            base + "/download_receipt_json?id=" + encodeURIComponent(id);

          receiptOts.href = otsHref;
          receiptJson.href = jsonHref;

          receiptOts.style.display = "inline-flex";
          receiptJson.style.display = "inline-flex";
          receiptMissing.style.display = "none";

          // Optional extra chip for ANCHORED with txid
          if (state === "ANCHORED" && txid) {
            pillExtra.style.display = "inline-flex";
            pillExtra.textContent = "Anchor ID: " + txid.slice(0, 8) + "…";
          } else {
            pillExtra.style.display = "none";
          }
        } catch (err) {
          console.error("verify_page runCheck error:", err);
          errorBox.style.display = "block";
          errorBox.textContent =
            "Could not look up this proof. If the ID is correct, try again in a minute.";
          setPillState("failed", "Unable to fetch anchor status.");
        } finally {
          btn.disabled = false;
          btnLabel.textContent = "Check status";
        }
      }

      btn.addEventListener("click", function (evt) {
        evt.preventDefault();
        runCheck();
      });

      idInput.addEventListener("keydown", function (evt) {
        if (evt.key === "Enter") {
          evt.preventDefault();
          runCheck();
        }
      });

      // Auto-run when the page is loaded with an id in the URL
      if (idInput.value.trim()) {
        runCheck();
      } else {
        resetOutputs();
      }
    })();
  </script>
</body>
</html>`;
}
