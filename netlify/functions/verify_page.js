"use strict";

// netlify/functions/verify_page.js
// Serves the Verify UI and calls JSON endpoints:
// - /.netlify/functions/anchor_status?id=...
// - /.netlify/functions/download_receipt?id=...
// - /.netlify/functions/download_receipt_json?id=...

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

  // Also support /v/:id style paths (e.g. /v/e2e-demo-001)
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
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Verify • docuProof</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --bg: #020714;
        --bg-panel: #050b1d;
        --bg-panel-soft: #070f22;
        --border-subtle: #151b2e;
        --text: #f7f9ff;
        --text-muted: #9aa4c4;
        --accent: #16ff70;
        --accent-soft: rgba(22, 255, 112, 0.12);
        --accent-strong: rgba(22, 255, 112, 0.32);
        --danger: #ff4d6a;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        height: 100%;
      }

      body {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text",
          "Segoe UI", sans-serif;
        background: radial-gradient(circle at top, #061227 0, #01030a 55%);
        color: var(--text);
        -webkit-font-smoothing: antialiased;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      button {
        font-family: inherit;
      }

      .shell {
        min-height: 100vh;
        max-width: 1120px;
        margin: 0 auto;
        padding: 20px 20px 32px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .logo-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }

           .logo-glyph {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background:
          center / contain no-repeat
          url("/.netlify/functions/logo_static");
        display: inline-block;
        /* Hide any stray text inside, just in case */
        font-size: 0;
        color: transparent;
      }

      .logo-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

          .logo-title {
        font-weight: 650;
        font-size: 16px;
        letter-spacing: 0.02em;
        /* no text-transform here so "docuProof" keeps its case */
      }

      .logo-sub {
        font-size: 11px;
        color: var(--text-muted);
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .header-actions {
        display: flex;
        gap: 10px;
      }

      .btn-base {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        border-radius: 999px;
        padding: 8px 18px;
        font-size: 13px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: none;
        border: 1px solid transparent;
        cursor: pointer;
        transition:
          transform 120ms ease-out,
          box-shadow 120ms ease-out,
          filter 120ms ease-out,
          background 120ms ease-out;
      }

      .btn-primary {
        composes: btn-base;
        background: var(--accent);
        color: #020513;
        border-color: transparent;
        box-shadow:
          0 0 12px var(--accent-strong),
          0 0 24px rgba(22, 255, 112, 0.35);
      }

      .btn-primary:hover {
        filter: brightness(1.03);
        transform: translateY(-0.5px);
        box-shadow:
          0 0 18px rgba(22, 255, 112, 0.5),
          0 0 36px rgba(22, 255, 112, 0.6);
      }

      .btn-primary:disabled {
        opacity: 0.5;
        cursor: default;
        box-shadow: none;
        filter: none;
        transform: none;
      }

      .btn-ghost {
        composes: btn-base;
        background: transparent;
        border-color: rgba(255, 255, 255, 0.06);
        color: var(--text);
      }

      .btn-ghost:hover {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.14);
      }

      .btn-check {
        min-width: 140px;
      }

      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1.06fr) minmax(0, 1fr);
        gap: 22px;
      }

      @media (max-width: 900px) {
        .layout {
          grid-template-columns: minmax(0, 1fr);
        }
        .header {
          flex-direction: column;
          align-items: flex-start;
        }
        .header-actions {
          align-self: stretch;
          justify-content: flex-start;
        }
      }

      .panel {
        background: linear-gradient(
          145deg,
          var(--bg-panel) 0,
          var(--bg-panel-soft) 62%
        );
        border-radius: 22px;
        padding: 22px 22px 20px;
        border: 1px solid var(--border-subtle);
        box-shadow:
          0 28px 80px rgba(0, 0, 0, 0.65),
          inset 0 0 0 1px rgba(255, 255, 255, 0.01);
      }

      .panel-title {
        font-size: 22px;
        font-weight: 650;
        margin-bottom: 6px;
      }

      .panel-subtitle {
        font-size: 14px;
        color: var(--text-muted);
        max-width: 540px;
      }

      .verify-header {
        margin-bottom: 20px;
      }

      .field-group {
        margin-bottom: 18px;
      }

      .field-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--text-muted);
        margin-bottom: 8px;
      }

      .field-input-row {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .input {
        flex: 1;
        min-width: 0;
        border-radius: 999px;
        border: 1px solid var(--border-subtle);
        padding: 9px 14px;
        font-size: 14px;
        background: radial-gradient(circle at top left, #10172c 0, #050915 70%);
        color: var(--text);
        outline: none;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.01);
      }

      .input::placeholder {
        color: rgba(154, 164, 196, 0.7);
      }

      .input:focus {
        border-color: rgba(22, 255, 112, 0.65);
        box-shadow:
          0 0 0 1px rgba(22, 255, 112, 0.55),
          0 0 18px rgba(22, 255, 112, 0.35);
      }

      .pill-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 18px;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(7, 15, 34, 0.9);
        color: var(--text-muted);
        white-space: nowrap;
      }

      .pill-soft {
        background: rgba(6, 13, 30, 0.9);
      }

      .pill-anchor-id {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .pill-success {
        background: linear-gradient(
          135deg,
          rgba(22, 255, 112, 0.9),
          rgba(22, 255, 171, 0.98)
        );
        border-color: transparent;
        color: #020513;
        box-shadow:
          0 0 16px rgba(22, 255, 112, 0.5),
          0 0 36px rgba(22, 255, 112, 0.75);
      }

      .pill-success-dot::before {
        content: "";
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #0b8b3b;
        box-shadow: 0 0 0 2px rgba(2, 5, 19, 0.5);
      }

      .fields-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .field-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 13px;
      }

      .field-row-label {
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.16em;
        font-size: 11px;
      }

      .field-row-value {
        text-align: right;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 13px;
        max-width: 60%;
        overflow-wrap: anywhere;
      }

      .field-row-value-soft {
        color: var(--text-muted);
      }

      .field-row-value-link a {
        color: #7bf8b9;
      }

      .field-row-value-link a:hover {
        text-decoration: underline;
      }

      .receipt-row {
        margin-top: 6px;
      }

      .pill-button-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 8px;
      }

      .pill-btn {
        border-radius: 999px;
        padding: 5px 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(6, 13, 30, 0.9);
        color: var(--text-muted);
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition:
          background 120ms ease-out,
          border-color 120ms ease-out,
          color 120ms ease-out,
          transform 120ms ease-out,
          box-shadow 120ms ease-out;
      }

      .pill-btn:hover:not(:disabled) {
        background: var(--accent);
        color: #020513;
        border-color: transparent;
        box-shadow:
          0 0 12px rgba(22, 255, 112, 0.4),
          0 0 26px rgba(22, 255, 112, 0.55);
        transform: translateY(-0.5px);
      }

      .pill-btn:disabled {
        opacity: 0.45;
        cursor: default;
        box-shadow: none;
        transform: none;
      }

      .what-youre-seeing {
        margin-top: 18px;
        padding-top: 12px;
        border-top: 1px dashed rgba(255, 255, 255, 0.08);
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.5;
      }

      .what-youre-seeing-title {
        font-size: 11px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        margin-bottom: 6px;
        color: var(--text-muted);
      }

      .what-youre-seeing-body {
        max-width: 560px;
      }

      /* Right side panel */

      .how-panel {
        position: relative;
        overflow: hidden;
      }

      .how-title {
        font-size: 20px;
        font-weight: 640;
        margin-bottom: 10px;
      }

      .how-body {
        font-size: 14px;
        color: var(--text-muted);
        line-height: 1.6;
        max-width: 640px;
      }

      .how-list {
        margin: 16px 0 16px 0;
        padding-left: 20px;
        color: var(--text-muted);
      }

      .how-list li {
        margin-bottom: 6px;
      }

      .how-footnote {
        margin-top: 16px;
        font-size: 13px;
        color: var(--text-muted);
      }

      .how-footnote-pill {
        margin-top: 18px;
        border-radius: 999px;
        padding: 8px 16px;
        border: 1px dashed rgba(255, 255, 255, 0.18);
        background: radial-gradient(
          circle at 0 0,
          rgba(22, 255, 112, 0.14),
          rgba(3, 13, 32, 0.9)
        );
        font-size: 13px;
        color: var(--text);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .how-footnote-pill-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--accent);
        box-shadow: 0 0 8px rgba(22, 255, 112, 0.7);
      }

      .footer {
        margin-top: 10px;
        font-size: 11px;
        color: rgba(154, 164, 196, 0.75);
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <header class="header">
        <div class="logo-row">
                    <div class="logo-glyph" aria-hidden="true"></div>
          <div class="logo-text">
            <div class="logo-title">docuProof</div>
            <div class="logo-sub">Proof you can point to.</div>
          </div>
        </div>
        <div class="header-actions">
          <a href="/start" class="btn-primary btn-base">Start · Generate</a>
        </div>
      </header>

      <main class="layout">
        <section class="panel">
          <div class="verify-header">
            <div class="panel-title">Check a timestamped proof</div>
            <div class="panel-subtitle">
              Paste the <strong>Proof ID</strong> from your docuProof certificate.
              You'll see its anchor status on the Bitcoin blockchain and can
              download the underlying timestamp receipt.
            </div>
          </div>

          <div class="field-group">
            <div class="field-label">Proof ID</div>
            <div class="field-input-row">
              <input
                id="proof-id"
                class="input"
                placeholder="e.g. e2e-demo-001"
                autocomplete="off"
              />
              <button
                id="btn-check"
                class="btn-primary btn-base btn-check"
                type="button"
              >
                Check status
              </button>
            </div>
          </div>

          <div class="pill-row">
            <div
              id="pill-state"
              class="pill pill-soft pill-state"
            >
              Waiting for a proof id
            </div>
            <div
              id="pill-anchor-id"
              class="pill pill-soft pill-anchor-id"
            >
              Anchor ID: —
            </div>
          </div>

          <div class="fields-stack">
            <div class="field-row">
              <div class="field-row-label">Anchor state</div>
              <div
                id="anchor-state"
                class="field-row-value field-row-value-soft"
              >
                —
              </div>
            </div>

            <div class="field-row">
              <div class="field-row-label">Bitcoin TXID</div>
              <div
                id="bitcoin-txid"
                class="field-row-value field-row-value-link"
              >
                —
              </div>
            </div>

            <div class="field-row">
              <div class="field-row-label">Confirmations</div>
              <div
                id="confirmations"
                class="field-row-value field-row-value-soft"
              >
                —
              </div>
            </div>

            <div class="field-row receipt-row">
              <div class="field-row-label">Receipt</div>
              <div class="field-row-value">
                <div class="pill-button-row">
                  <button
                    id="btn-ots"
                    type="button"
                    class="pill-btn"
                    disabled
                  >
                    OTS
                  </button>
                  <button
                    id="btn-anchor-receipt"
                    type="button"
                    class="pill-btn"
                    disabled
                  >
                    Anchor receipt
                  </button>
                  <button
                    id="btn-anchor-metadata"
                    type="button"
                    class="pill-btn"
                    disabled
                  >
                    Anchor metadata
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="what-youre-seeing">
            <div class="what-youre-seeing-title">What you're seeing</div>
            <div class="what-youre-seeing-body">
              docuProof stores your receipt and anchor metadata, and independently
              you can verify the txid and Merkle inclusion on any Bitcoin
              blockchain explorer.
            </div>
          </div>
        </section>

        <section class="panel how-panel">
          <div class="how-title">How this verification works</div>
          <div class="how-body">
            docuProof keeps your file private in your browser. What we store is a
            cryptographic fingerprint (SHA-256 hash) and an OpenTimestamps
            receipt anchored to the Bitcoin blockchain.
            <ul class="how-list">
              <li>
                <strong>Anchor state</strong> tells you whether your proof has
                been committed into a Bitcoin block.
              </li>
              <li>
                <strong>Bitcoin txid</strong> is the transaction you can inspect
                on any public Bitcoin explorer.
              </li>
              <li>
                <strong>OTS receipt</strong> is the portable proof file. You can
                independently verify it with the open-source OpenTimestamps tools.
              </li>
            </ul>
            For strict evidentiary use, keep these together:
            <ul class="how-list">
              <li>Your original file (unchanged).</li>
              <li>Your docuProof PDF certificate.</li>
              <li>The downloaded <code>.ots</code> receipt file.</li>
            </ul>
          </div>
          <div class="how-footnote-pill">
            <div class="how-footnote-pill-dot"></div>
            <div>
              The closer you are to the original anchor date, the harder it is
              to dispute when the file existed.
            </div>
          </div>
        </section>
      </main>

      <footer class="footer">
        © 2025 docuProof.io — Bitcoin-anchored proof of existence.
      </footer>
    </div>

    <script>
      (function () {
        const initialId = "${esc(initialId)}";

        const input = document.getElementById("proof-id");
        const btnCheck = document.getElementById("btn-check");
        const pillState = document.getElementById("pill-state");
        const pillAnchorId = document.getElementById("pill-anchor-id");
        const fieldState = document.getElementById("anchor-state");
        const fieldTxid = document.getElementById("bitcoin-txid");
        const fieldConf = document.getElementById("confirmations");
        const btnOts = document.getElementById("btn-ots");
        const btnAnchorReceipt = document.getElementById("btn-anchor-receipt");
        const btnAnchorMeta = document.getElementById("btn-anchor-metadata");

        let currentId = initialId || "";

        function setLoading(isLoading) {
          if (!btnCheck) return;
          btnCheck.disabled = isLoading;
          btnCheck.textContent = isLoading ? "Checking…" : "Check status";
        }

        function resetOutputs() {
          pillState.classList.remove("pill-success", "pill-success-dot");
          pillState.textContent = "Waiting for a proof id";

          pillAnchorId.textContent = "Anchor ID: —";

          fieldState.textContent = "—";
          fieldTxid.textContent = "—";
          fieldConf.textContent = "—";

          fieldTxid.innerHTML = "—";

          [btnOts, btnAnchorReceipt, btnAnchorMeta].forEach(function (btn) {
            if (btn) {
              btn.disabled = true;
            }
          });
        }

        async function runCheck(id) {
          const trimmed = (id || "").trim();
          if (!trimmed) return;

          currentId = trimmed;
          setLoading(true);
          resetOutputs();

          const url =
            "/.netlify/functions/anchor_status?id=" +
            encodeURIComponent(trimmed);

          try {
            const resp = await fetch(url, { cache: "no-store" });
            const data = await resp.json().catch(function () {
              return {};
            });

            if (!resp.ok || !data || data.ok === false) {
              const msg =
                (data && (data.error || data.message)) ||
                "Unable to fetch anchor status.";
              pillState.textContent = "Error checking status";
              fieldState.textContent = msg;
              setLoading(false);
              return;
            }

            const state = data.state || "UNKNOWN";
            const txid = data.txid || null;
            const anchorKey = data.anchorKey || data.anchorId || null;
            const confirmations =
              typeof data.confirmations === "number"
                ? String(data.confirmations)
                : null;

            // Pills
            pillState.classList.add("pill-success", "pill-success-dot");
            pillState.textContent =
              state === "ANCHORED"
                ? "Anchored on the Bitcoin blockchain"
                : state;

            pillAnchorId.textContent = anchorKey
              ? "Anchor ID: " + anchorKey
              : "Anchor ID: —";

            // Detail fields
            fieldState.textContent = state;

            if (txid) {
              const safeTxid = String(txid);
              const short =
                safeTxid.length > 18
                  ? safeTxid.slice(0, 12) + "…" + safeTxid.slice(-6)
                  : safeTxid;
              const href =
                "https://mempool.space/tx/" + encodeURIComponent(safeTxid);
              fieldTxid.innerHTML =
                '<a href="' +
                href +
                '" target="_blank" rel="noopener noreferrer">' +
                short +
                "</a>";
            } else {
              fieldTxid.textContent = "—";
            }

            fieldConf.textContent = confirmations || "0";

            // Enable downloads when we have at least an anchor id
            if (anchorKey) {
              if (btnOts) {
                btnOts.disabled = false;
                btnOts.onclick = function () {
                  window.location.href =
                    "/.netlify/functions/download_receipt?id=" +
                    encodeURIComponent(currentId);
                };
              }
              if (btnAnchorReceipt) {
                btnAnchorReceipt.disabled = false;
                btnAnchorReceipt.onclick = function () {
                  window.location.href =
                    "/.netlify/functions/download_receipt_json?id=" +
                    encodeURIComponent(currentId);
                };
              }
              if (btnAnchorMeta) {
                btnAnchorMeta.disabled = false;
                btnAnchorMeta.onclick = function () {
                  window.location.href =
                    "/.netlify/functions/download_receipt_json?id=" +
                    encodeURIComponent(currentId);
                };
              }
            }

            setLoading(false);
          } catch (e) {
            console.error("verify_page: error", e);
            pillState.textContent = "Error checking status";
            fieldState.textContent = "Network or server error.";
            setLoading(false);
          }
        }

        if (input) {
          input.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
              ev.preventDefault();
              if (btnCheck && !btnCheck.disabled) {
                btnCheck.click();
              }
            }
          });
        }

        if (btnCheck) {
          btnCheck.addEventListener("click", function () {
            if (!input) return;
            const id = input.value.trim();
            if (!id) return;
            runCheck(id);
          });
        }

        // Seed from initialId (querystring or /v/:id)
        if (initialId && input) {
          input.value = initialId;
          runCheck(initialId);
        }
      })();
    </script>
  </body>
</html>`;
}
