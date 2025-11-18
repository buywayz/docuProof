// netlify/functions/verify_page.js
// Serves the HTML Verify UI and calls JSON endpoints:
// - /.netlify/functions/anchor_status?id=...
// - /.netlify/functions/download_receipt?id=...
// - /.netlify/functions/download_receipt_json?id=...
// - /.netlify/functions/verify?id=...

exports.handler = async (event) => {
  const url = new URL(event.rawUrl || "http://x/");
  const qsId = (url.searchParams.get("id") || "").trim();

  // Allow /v/<id> style paths as a fallback
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
    --warn-bg:#231c12;--warn-border:#5f461f;--warn-text:#f4d28a;
    --err-bg:#241313;--err-border:#6b2626;--err-text:#ffb4b4;
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
/* Visually dim disabled buttons (e.g., OTS when no receipt yet) */
.btn[disabled]{
  opacity:0.45;
  cursor:default;
  box-shadow:none;
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
  .badge.warn{
    border:1px solid var(--warn-border);
    color:var(--warn-text);
    background:var(--warn-bg);
  }
  .badge.err{
    border:1px solid var(--err-border);
    color:var(--err-text);
    background:var(--err-bg);
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
        <div class="small" style="margin-bottom:14px">
          Keep your original file and this <code>.ots</code> together so future verification is trivial.
        </div>

        <div class="small" style="margin-top:4px">
          <strong>Shareable QR</strong>
          <div style="margin-top:8px;display:flex;justify-content:center;">
            <canvas id="qrCanvas" width="180" height="180"
                    style="border-radius:12px;background:#111516;"></canvas>
          </div>
          <div id="qrCaption" class="small" style="text-align:center;margin-top:6px;">
            Scan to open this verification page on another device.
          </div>
        </div>
      </aside>
    </div>
  </main>

  <footer>
    © <span id="year"></span> docuProof.io — Bitcoin-anchored proof of existence.
  </footer>

<!-- Load QRious without integrity/crossorigin so the browser does not block it -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrious/4.0.2/qrious.min.js"></script>

<script>
(function () {
  function $(id) { return document.getElementById(id); }

  // Small helper to safely embed JSON into our viewer page
  function htmlEscape(s) {
    return s.replace(/[&<>]/g, function (c) {
      if (c === "&") return "&amp;";
      if (c === "<") return "&lt;";
      return "&gt;";
    });
  }

  document.getElementById("year").textContent = new Date().getFullYear();

  var idFromServer = "__ID__";
  var hasId = __HAS_ID__;

  var idIn   = $("idIn");
  var goBtn  = $("goBtn");
  var dlOts  = $("dlOts");
  var dlCert = $("dlCert");

  var kv = {
    id: $("kv_id"),
    state: $("kv_state"),
    txid: $("kv_txid"),
    conf: $("kv_conf"),
    anchor: $("kv_anchor"),
    receipt: $("kv_receipt")
  };

  var badges     = $("statusBadges");
  var statusHelp = $("statusHelp");
  var qrCanvas   = $("qrCanvas");
  var qrCaption  = $("qrCaption");

  if (hasId && idFromServer) {
    idIn.value = idFromServer;
  }

  goBtn.addEventListener("click", function () {
    var v = (idIn.value || "").trim();
    if (!v) return;
    var qs = new URLSearchParams({ id: v }).toString();
    // Pretty URL; /verify is wired to this function via _redirects
    location.href = "/verify?" + qs;
  });

  // Click handler for “View verification JSON”
  if (dlCert) {
    dlCert.addEventListener("click", async function () {
      var v = (idIn.value || "").trim();
      if (!v) return;

      try {
        var resp = await fetch(
          "/.netlify/functions/verify?id=" + encodeURIComponent(v),
          { cache: "no-store" }
        );
        if (!resp.ok) throw new Error("HTTP " + resp.status);

        var data = await resp.json();
        var pretty = JSON.stringify(data, null, 2);

        var win = window.open("", "_blank");
        if (!win) return; // Popup blocked

        var html =
          "<!doctype html><html><head>" +
            "<meta charset='utf-8'>" +
            "<title>Verification JSON – " + htmlEscape(v) + "</title>" +
            "<style>" +
              "body{background:#0b0f14;color:#eaeaea;" +
              "font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;" +
              "padding:16px;margin:0;}" +
              "pre{white-space:pre-wrap;word-break:break-word;}" +
            "</style>" +
          "</head><body>" +
            "<pre>" + htmlEscape(pretty) + "</pre>" +
          "</body></html>";

        win.document.write(html);
        win.document.close();
      } catch (e) {
        alert("Could not load verification JSON. Please try again.");
      }
    });
  }

  function clearBadge() {
    badges.innerHTML = "";
    statusHelp.textContent = "";
  }

  function setBadge(kind, title, detail) {
    badges.innerHTML = "";

    var pill = document.createElement("span");
    pill.className = "badge " + kind;
    pill.textContent = title;
    badges.appendChild(pill);

    if (detail) {
      statusHelp.textContent = detail;
    } else {
      statusHelp.textContent = "";
    }
  }

  function resetUI() {
    clearBadge();
    var k;
    for (k in kv) {
      if (Object.prototype.hasOwnProperty.call(kv, k)) {
        kv[k].textContent = "—";
      }
    }
    if (dlOts) dlOts.disabled = true;
    if (dlCert) dlCert.disabled = true;

    if (qrCanvas && qrCanvas.getContext) {
      var ctx = qrCanvas.getContext("2d");
      ctx.clearRect(0, 0, qrCanvas.width, qrCanvas.height);
    }
    if (qrCaption) {
      qrCaption.textContent = "Scan to open this verification page on another device.";
    }
  }

  function renderQrForId(v) {
    if (!qrCanvas || !window.QRious) return;
    var publicUrl = location.origin + "/verify?id=" + encodeURIComponent(v);
    new QRious({
      element: qrCanvas,
      value: publicUrl,
      size: 180,
      level: "M"
    });
  }

  async function fetchStatus(id) {
    var url = "/.netlify/functions/anchor_status?id=" + encodeURIComponent(id);
    var r = await fetch(url, { cache: "no-store" });
    var data = {};
    try {
      data = await r.json();
    } catch (e) {
      data = {};
    }

    if (r.status === 404) {
      if (!data || typeof data !== "object") {
        data = {};
      }
      if (!data.state) data.state = "NOT_FOUND";
      if (data.confirmations == null) data.confirmations = 0;
      return data;
    }

    if (!r.ok) {
      throw new Error("HTTP " + r.status);
    }
    return data;
  }

  async function load() {
    var v = (idIn.value || "").trim();

    resetUI();

    if (!v) {
      // Nothing entered yet; leave the table blank.
      return;
    }

    kv.id.textContent = v;
    if (dlCert) dlCert.disabled = false;

    renderQrForId(v);

    var status;
    try {
      status = await fetchStatus(v);
    } catch (e) {
      setBadge(
        "err",
        "Status lookup failed",
        "We could not retrieve status for this ID. Try again in a moment, or confirm the ID from your certificate."
      );
      return;
    }

    var state = status.state || "";
    var displayState = state === "NOT_FOUND" ? "Pending" : (state || "—");
    kv.state.textContent = displayState;

    if (status.txid) {
      var mempoolUrl = "https://mempool.space/tx/" + encodeURIComponent(status.txid);
      kv.txid.innerHTML =
        '<a class="mono" href="' + mempoolUrl + '" target="_blank" rel="noopener">' +
        status.txid +
        "</a>";
    } else {
      kv.txid.textContent = "—";
    }

    kv.conf.textContent = status.confirmations != null ? status.confirmations : 0;
    kv.anchor.textContent = status.anchorKey || "—";

    if (state === "NOT_FOUND") {
      setBadge(
        "neutral",
        "No proof found yet",
        "We do not see a receipt or Bitcoin anchor for this ID yet. If you just created this proof, allow time for batching and anchoring. You can still verify independently later using your .ots receipt and original file."
      );
      return;
    }

    if (state === "OTS_RECEIPT") {
      setBadge(
        "ok",
        "Receipt available — awaiting anchor",
        "Your proof has been committed to the OpenTimestamps calendar and is waiting to be included in a Bitcoin transaction. Keep your .ots receipt and original file together — they are enough to prove this timestamp independently."
      );
    } else if (state === "ANCHORED") {
      var conf = status.confirmations != null ? status.confirmations : 0;
      var msg;
      if (conf > 0) {
        msg = "Your proof is anchored in a Bitcoin transaction with " +
              conf +
              " confirmation" +
              (conf === 1 ? "" : "s") +
              ".";
      } else {
        msg = "Your proof is anchored in a Bitcoin transaction. Additional confirmations will accumulate over time.";
      }
      setBadge("ok", "Anchored on Bitcoin", msg);
    } else if (state) {
      setBadge("ok", displayState, "Proof status returned by the verification service.");
    }

    if (state === "OTS_RECEIPT") {
      try {
        var djResponse = await fetch(
          "/.netlify/functions/download_receipt_json?id=" + encodeURIComponent(v),
          { cache: "no-store" }
        );
        var dj;
        try {
          dj = await djResponse.json();
        } catch (e2) {
          dj = null;
        }

        if (dj && dj.base64 && dj.base64.length) {
          kv.receipt.textContent = dj.key || (v + ".ots");
          if (dlOts) {
            dlOts.disabled = false;
            dlOts.onclick = function () {
              window.location.href =
                "/.netlify/functions/download_receipt?id=" + encodeURIComponent(v);
            };
          }
        } else {
          kv.receipt.textContent = "—";
        }
      } catch (e3) {
        kv.receipt.textContent = "—";
      }
    }
  }

  if (hasId && idFromServer) {
    load();
  }
})();
</script>

</body>
</html>`;

function escapeHtml(s){
  return s.replace(/[&<>"']/g, function (c) {
    return { "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c];
  });
}