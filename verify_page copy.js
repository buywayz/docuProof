"use strict";

// netlify/functions/verify_page.js
// Serves the Verify UI and calls JSON endpoints:
//  - /.netlify/functions/anchor_status?id=...
//  - /.netlify/functions/download_receipt?id=...
//  - /.netlify/functions/download_receipt_json?id=...

exports.handler = async (event) => {
  const rawUrl = event.rawUrl || "http://x/";
  let initialId = "";

  try {
    const url = new URL(rawUrl);
    const qsId = (url.searchParams.get("id") || "").trim();
    if (qsId) initialId = qsId;
  } catch {
    // ignore
  }

  // Also support /v/:id or /verify/:id style paths
  if (!initialId && event.path) {
    const parts = String(event.path).split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    if (last && last !== "verify" && last !== "v") {
      initialId = last;
    }
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
  const initialEsc = esc(initialId);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Verify · docuProof</title>
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
      --accent-soft: rgba(22,255,112,0.12);
      --accent-strong: rgba(22,255,112,0.32);
      --danger: #ff4d6a;
      --pill-bg: #050b1d;
      --pill-border: #252c45;
      --pill-disabled: #22283a;
      --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text",
                   "Inter", "Segoe UI", sans-serif;
      --radius-lg: 18px;
      --radius-pill: 999px;
      --shadow-soft: 0 18px 50px rgba(0,0,0,0.65);
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
    }

    body {
      font-family: var(--font-sans);
      background: radial-gradient(circle at top, #07102c 0, #020513 48%, #000 100%);
      color: var(--text);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px 48px;
    }

    .page {
      width: 100%;
      max-width: 1200px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }

    .logo-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-glyph {
      width: 32px;
      height: 32px;
      border-radius: 10px;
      background: radial-gradient(circle at 30% 0, #7bffb1 0, #16ff70 25%, #00c854 65%, #006634 100%);


    color: #020513 !important;
    text-shadow: none !important;

      box-shadow:
        0 0 20px rgba(22,255,112,0.6),
        0 0 60px rgba(22,255,112,0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      letter-spacing: 0.03em;
      font-size: 15px;
      color: #020513;
    }

    .logo-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .logo-title {
      font-size: 18px;
      font-weight: 610;
      letter-spacing: 0.02em;
    }

    .logo-sub {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.22em;
      color: var(--text-muted);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    a {
      color: inherit;
      text-decoration: none;
    }

    .btn-ghost,
    .btn-primary {
      border-radius: var(--radius-pill);
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid transparent;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
      transition: background 0.14s ease, border-color 0.14s ease, transform 0.08s ease;
    }

    .btn-ghost {
      background: transparent;
      border-color: rgba(255,255,255,0.12);
      color: var(--text-muted);
    }

    .btn-ghost:hover {
      border-color: rgba(255,255,255,0.3);
      background: rgba(9,14,32,0.85);
      transform: translateY(-0.5px);
    }

    .btn-primary {
      background: var(--accent);
      color: #020513;
      border-color: transparent;
      box-shadow: 0 0 18px rgba(22,255,112,0.35);
    }

    .btn-primary:hover {
      filter: brightness(1.02);
      box-shadow: 0 0 24px rgba(22,255,112,0.5);
      transform: translateY(-0.5px);
    }
.btn-outline:hover {
  background: rgba(22,255,112,0.15);
}

.pill:hover {
  background: var(--accent) !important;
  color: #020513 !important;
}
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      gap: 20px;
    }

    .panel {
      background: linear-gradient(145deg, var(--bg-panel) 0, var(--bg-panel-soft) 52%, #050815 100%);
      border-radius: 26px;
      box-shadow: var(--shadow-soft);
      border: 1px solid rgba(255,255,255,0.04);
      padding: 20px 22px 22px;
    }

    .verify-header {
      margin-bottom: 12px;
    }

    .panel-title {
      font-size: 22px;
      font-weight: 620;
      margin-bottom: 4px;
    }

    .panel-subtitle {
      font-size: 13px;
      line-height: 1.4;
      color: var(--text-muted);
    }

    .form-row {
      margin-top: 18px;
      margin-bottom: 14px;
    }

    .form-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.22em;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .input-row {
      display: flex;
      gap: 10px;
      align-items: center;
    }

    .input {
      flex: 1 1 auto;
      border-radius: var(--radius-pill);
      border: 1px solid var(--border-subtle);
      background: radial-gradient(circle at top left, #0c152e 0, #050b1c 40%, #020512 100%);
      color: var(--text);
      padding: 10px 14px;
      font-size: 14px;
      outline: none;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
    }

    .input::placeholder {
      color: rgba(154,164,196,0.6);
    }

    .input:focus {
      border-color: rgba(22,255,112,0.7);
      box-shadow:
        0 0 0 1px rgba(22,255,112,0.3),
        0 0 24px rgba(22,255,112,0.22);
    }

    .btn-check {
      flex: 0 0 auto;
      border-radius: var(--radius-pill);
      border: none;
      background: var(--accent);
      color: #020513;
      font-size: 13px;
      font-weight: 550;
      padding: 10px 18px;
      box-shadow: 0 0 18px rgba(22,255,112,0.4);
      cursor: pointer;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn-check:hover {
      filter: brightness(1.03);
      box-shadow: 0 0 24px rgba(22,255,112,0.6);
      transform: translateY(-0.5px);
    }

    .status-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 18px;
      margin-top: 6px;
    }

    .status-pill {
      border-radius: 999px;
      font-size: 11px;
      padding: 4px 13px;
      border: 1px solid rgba(255,255,255,0.08);
      background: radial-gradient(circle at top left, #0c1329 0,#050916 45%,#02040c 100%);
      color: var(--text-muted);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .status-pill-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.25);
    }

    .status-pill-primary {
      border-color: var(--accent-strong);
      background: radial-gradient(circle at 10% 0, rgba(22,255,112,0.5) 0,
                rgba(5,12,32,0.95) 40%, #050814 100%);
      color: #d8ffe9;
    }

    .status-pill-primary .status-pill-dot {
      background: var(--accent);
      box-shadow: 0 0 10px rgba(22,255,112,0.8);
    }

    .field-row {
      margin: 10px 0;
    }

    .field-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.22em;
      color: var(--text-muted);
      margin-bottom: 3px;
    }

    .field-value {
      font-size: 14px;
      min-height: 18px;
      color: var(--text);
      word-break: break-all;
    }

    .field-value.mono {
      font-family: "SF Mono", ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
    }

    .field-value-muted {
      color: var(--text-muted);
      font-size: 13px;
    }

    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
    }

    .pill {
      border-radius: var(--radius-pill);
      padding: 6px 14px;
      font-size: 12px;
      border: 1px solid var(--pill-border);
      background: var(--pill-bg);
      color: var(--text-muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease, transform 0.08s ease;
    }

    .pill-pill {
      text-transform: uppercase;
      letter-spacing: 0.14em;
      font-size: 11px;
    }

    .pill:hover:not(.pill-disabled) {
      background: rgba(20,28,60,0.95);
      border-color: rgba(255,255,255,0.28);
      color: #e2e7ff;
      transform: translateY(-0.5px);
    }

    .pill-disabled {
      opacity: 0.55;
      cursor: default;
      background: var(--pill-disabled);
      border-color: rgba(255,255,255,0.05);
    }

    .panel-right-title {
      font-size: 18px;
      font-weight: 580;
      margin-bottom: 4px;
    }

    .panel-right-body {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .bullet-list {
      margin: 14px 0 0;
      padding-left: 18px;
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.55;
    }

    .note-row {
      margin-top: 16px;
      padding: 10px 12px;
      border-radius: var(--radius-pill);
      border: 1px dashed rgba(255,255,255,0.14);
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 12px;
      color: var(--text-muted);
      background: radial-gradient(circle at left, rgba(22,255,112,0.17) 0,
                 rgba(11,18,40,0.96) 42%, #050817 100%);
    }

    .note-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 10px rgba(22,255,112,0.9);
    }

    .footer {
      margin-top: 20px;
      font-size: 11px;
      color: rgba(154,164,196,0.7);
      text-align: center;
    }

    @media (max-width: 880px) {
      .layout {
        grid-template-columns: minmax(0, 1fr);
      }
      .panel {
        padding: 18px 16px 20px;
      }
      body {
        padding-top: 22px;
      }
    }
/* ----- docuProof UI green fixes ----- */
.badge-success,
.status-success {
  background: var(--accent);
  color: #ffffff;
}

.pill {
  background: var(--bg-panel-soft);
  border: 1px solid var(--border-subtle);
}

.pill.active,
.pill:hover {
  background: var(--accent);
  color: #ffffff;
  border-color: var(--accent);
}

.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #ffffff;
}

.btn-primary:hover {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
}

.btn-ghost {
  color: var(--text);
  border-color: var(--border-subtle);
}

.btn-ghost:hover {
  background: var(--accent-soft);
  color: #ffffff;
  border-color: var(--accent);
}
 
 </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="logo-row">
        <div class="logo-glyph">dp</div>
        <div class="logo-text">
          <div class="logo-title">docuProof</div>
          <div class="logo-sub">Proof you can point to.</div>
        </div>
      </div>
      <div class="header-actions">
        <a id="nav-verify-link" href="/verify" class="btn-ghost">Verify</a>
        <a href="/start" class="btn-primary">Start · Generate</a>
      </div>
    </header>

    <main class="layout">
      <section class="panel">
        <div class="verify-header">
          <div class="panel-title">Check a timestamped proof</div>
          <div class="panel-subtitle">
            Paste the <strong>Proof ID</strong> from your docuProof certificate.
            You'll see its anchor status on the Bitcoin blockchain and can download the underlying timestamp receipt.
          </div>
        </div>

        <form id="verify-form">
          <div class="form-row">
            <div class="form-label">Proof ID</div>
            <div class="input-row">
              <input
                id="proof-id-input"
                class="input"
                type="text"
                placeholder="e.g. e2e-demo-001"
                autocomplete="off"
                value="${initialEsc}"
              />
              <button id="btn-check" class="btn-check" type="submit">
                <span>●</span>
                <span>Check status</span>
              </button>
            </div>
          </div>
        </form>

        <div class="status-pills">
          <div id="badge-anchor-state" class="status-pill status-pill-primary">
            <div class="status-pill-dot"></div>
            <span>Waiting for a proof id</span>
          </div>
          <div id="badge-anchor-id" class="status-pill">
            <span>ANCHOR ID: —</span>
          </div>
        </div>

        <div class="field-row">
          <div class="field-label">Anchor state</div>
          <div class="field-value" id="anchor-state">—</div>
        </div>

        <div class="field-row">
          <div class="field-label">Bitcoin txid</div>
          <div class="field-value mono" id="bitcoin-txid">—</div>
        </div>

        <div class="field-row">
          <div class="field-label">Confirmations</div>
          <div class="field-value field-value-muted" id="confirmations">—</div>
        </div>

        <div class="field-row">
          <div class="field-label">Receipt</div>
          <div class="pill-row">
            <button id="btn-ots" class="pill pill-pill pill-disabled" disabled>OTS</button>
            <button id="btn-anchor-receipt" class="pill pill-pill pill-disabled" disabled>anchor receipt</button>
            <button id="btn-anchor-json" class="pill pill-pill pill-disabled" disabled>anchor metadata</button>
          </div>
        </div>

        <div class="field-row">
          <div class="field-label">What you're seeing</div>
          <div class="field-value field-value-muted">
            docuProof stores your receipt and anchor metadata, and independently you can verify the txid
            and Merkle inclusion on any Bitcoin blockchain explorer.
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="panel-right-title">How this verification works</div>
        <div class="panel-right-body">
          docuProof keeps your file private in your browser. What we store is a cryptographic fingerprint
          (SHA-256 hash) and an OpenTimestamps receipt anchored to the Bitcoin blockchain.
        </div>
        <ul class="bullet-list">
          <li><strong>Anchor state</strong> tells you whether your proof has been committed into a Bitcoin block.</li>
          <li><strong>Bitcoin txid</strong> is the transaction you can inspect on any public Bitcoin explorer.</li>
          <li><strong>OTS receipt</strong> is the portable proof file. You can independently verify it with the
              open-source OpenTimestamps tools.</li>
        </ul>
        <div class="bullet-list" style="margin-top:18px;">
          For strict evidentiary use, keep these together:
          <ul class="bullet-list">
            <li>Your original file (unchanged).</li>
            <li>Your docuProof PDF certificate.</li>
            <li>The downloaded <code>.ots</code> receipt file.</li>
          </ul>
        </div>

        <div class="note-row">
          <div class="note-dot"></div>
          <div>
            The closer you are to the original anchor date, the harder it is to dispute when the file existed.
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
      function byId(id) { return document.getElementById(id); }
      var input = byId("proof-id-input");
      var btnCheck = byId("btn-check");
      var badgeState = byId("badge-anchor-state");
      var badgeAnchorId = byId("badge-anchor-id");
      var fieldState = byId("anchor-state");
      var fieldTxid = byId("bitcoin-txid");
      var fieldConf = byId("confirmations");
      var btnOts = byId("btn-ots");
      var btnAnchorReceipt = byId("btn-anchor-receipt");
      var btnAnchorJson = byId("btn-anchor-json");
      var navVerify = byId("nav-verify-link");
      var form = byId("verify-form");

      function setText(el, value) {
        if (!el) return;
        el.textContent = value;
      }

      function setConfirmations(state, data) {
        if (!fieldConf) return;
        if (typeof data.confirmations === "number" && data.confirmations >= 0) {
          setText(fieldConf, String(data.confirmations));
          return;
        }
        if (state === "ANCHORED" && data.txid) {
          fieldConf.textContent =
            "Not tracked by docuProof — check confirmations in your Bitcoin explorer.";
        } else {
          fieldConf.textContent = "—";
        }
      }

      function updateNavLink(id) {
        if (!navVerify) return;
        if (id) {
          navVerify.href = "/verify?id=" + encodeURIComponent(id);
        } else {
          navVerify.href = "/verify";
        }
      }

      function setButtonsEnabled(id, enabled) {
        var pills = [btnOts, btnAnchorReceipt, btnAnchorJson];
        pills.forEach(function (b) {
          if (!b) return;
          b.disabled = !enabled;
          if (enabled) {
            b.classList.remove("pill-disabled");
          } else {
            if (!b.classList.contains("pill-disabled")) {
              b.classList.add("pill-disabled");
            }
          }
        });

        if (!enabled || !id) {
          if (btnOts) btnOts.onclick = null;
          if (btnAnchorReceipt) btnAnchorReceipt.onclick = null;
          if (btnAnchorJson) btnAnchorJson.onclick = null;
          return;
        }

        if (btnOts) {
          btnOts.onclick = function () {
            window.location.href =
              "/.netlify/functions/download_receipt?id=" + encodeURIComponent(id);
          };
        }
        if (btnAnchorReceipt) {
          btnAnchorReceipt.onclick = function () {
            window.location.href =
              "/.netlify/functions/download_receipt?id=" + encodeURIComponent(id);
          };
        }
        if (btnAnchorJson) {
          btnAnchorJson.onclick = function () {
            window.location.href =
              "/.netlify/functions/download_receipt_json?id=" + encodeURIComponent(id);
          };
        }
      }

      var currentId = "";
      (function initInitialId() {
        // Prefer whatever is already in the input (server filled from query)
        if (input && input.value.trim()) {
          currentId = input.value.trim();
          return;
        }

        try {
          var url = new URL(window.location.href);
          var qs = (url.searchParams.get("id") || "").trim();
          if (qs) {
            currentId = qs;
            if (input) input.value = qs;
            return;
          }
          var parts = window.location.pathname.split("/").filter(Boolean);
          var last = parts[parts.length - 1] || "";
          if (last && last !== "verify" && last !== "v") {
            currentId = last;
            if (input) input.value = last;
          }
        } catch (e) {
          // ignore
        }
      })();

      function clearFields() {
        setText(fieldState, "—");
        setText(fieldTxid, "—");
        setText(fieldConf, "—");
        if (badgeState) {
          setText(badgeState, "");
          badgeState.innerHTML =
            '<div class="status-pill-dot"></div><span>Waiting for a proof id</span>';
        }
        if (badgeAnchorId) {
          badgeAnchorId.innerHTML = "<span>ANCHOR ID: —</span>";
        }
        setButtonsEnabled(currentId, false);
      }

      function renderStatus(data) {
        var state = (data && data.state) || "UNKNOWN";
        var txid = data && data.txid;

        setText(fieldState, state);
        setText(fieldTxid, txid || "—");

        if (badgeState) {
          var label;
          if (state === "ANCHORED") {
            label = "Anchored on the Bitcoin blockchain";
          } else if (state === "OTS_RECEIPT") {
            label = "Receipt available — awaiting anchor";
          } else if (state === "NOT_FOUND") {
            label = "Proof not found";
          } else {
            label = "Waiting for a proof id";
          }
          badgeState.innerHTML =
            '<div class="status-pill-dot"></div><span>' + label + "</span>";
        }

        if (badgeAnchorId) {
          var anchorLabel = data && data.anchorKey ? data.anchorKey : "—";
          badgeAnchorId.innerHTML = "<span>ANCHOR ID: " + anchorLabel + "</span>";
        }

        setConfirmations(state, data || {});
        setButtonsEnabled(currentId, !!(data && data.ok));
      }

      function showError(msg) {
        setText(fieldState, "ERROR");
        setText(fieldTxid, "—");
        if (fieldConf) {
          fieldConf.textContent = msg || "Unable to load status.";
        }
        if (badgeState) {
          badgeState.innerHTML =
            '<div class="status-pill-dot"></div><span>Error loading status</span>';
        }
        setButtonsEnabled(currentId, false);
      }

      function fetchStatus(id) {
        if (!id) {
          currentId = "";
          updateNavLink("");
          clearFields();
          return;
        }

        currentId = id;
        updateNavLink(id);

        setText(fieldState, "…");
        setText(fieldTxid, "…");
        if (fieldConf) fieldConf.textContent = "Checking status…";
        setButtonsEnabled(id, false);

        fetch("/.netlify/functions/anchor_status?id=" + encodeURIComponent(id))
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (!data || data.ok === false) {
              var msg = (data && data.error) || "Status not found.";
              showError(msg);
              return;
            }
            renderStatus(data);
          })
          .catch(function (err) {
            console.error("anchor_status error", err);
            showError("Network error while loading status.");
          });
      }

      if (btnCheck) {
        btnCheck.addEventListener("click", function (e) {
          e.preventDefault();
          var id = input && input.value ? input.value.trim() : "";
          fetchStatus(id);
        });
      }

      if (form) {
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var id = input && input.value ? input.value.trim() : "";
          fetchStatus(id);
        });
      }

      // Initial render
      if (currentId) {
        fetchStatus(currentId);
      } else {
        clearFields();
        updateNavLink("");
      }
    })();
  </script>
</body>
</html>`;
}
