// netlify/functions/history.js
// Render recent proofs (global feed or filtered by email) from Netlify Blobs.

const { listProofs } = require("./_db");

// Ensure @netlify/blobs can be resolved in this function bundle
async function _warmupBlobs() {
  try { await import("@netlify/blobs"); } catch {}
}

exports.handler = async (event) => {
  // Warm and initialize Lambda adapter for Blobs
  await _warmupBlobs();
  try {
    const { connectLambda } = await import("@netlify/blobs");
    await connectLambda(event);
  } catch {
    // non-fatal: if not available the page will just show no items
  }

  try {
    const qs = event.queryStringParameters || {};
    const email = (qs.email || "").trim() || null;
    const limit = Math.max(1, Math.min(200, parseInt(qs.limit || "50", 10) || 50));
    const view = (qs.view || "").toLowerCase();  // "table" or "tiles"
    const isTiles = view === "tiles";            // boolean flag we’ll use later

    const items = await listProofs({ email, limit });

    const title = email ? `Proof History – ${email}` : "Proof History – All";

    const rows = items.map((r) => {
  const id = r.id || "—";
  const fname = r.filename || "—";
  const dname = r.displayName || "—";
  const hash = r.hash || "—";
  const mail = r.customerEmail || "—";
  const created = r.createdAt || "—";
  const viewUrl = `/.netlify/functions/view_proof?id=${encodeURIComponent(id)}`;
  const verifyUrl = `/.netlify/functions/verify_page?id=${encodeURIComponent(id)}`;
  return `
    <tr>
      <td><a href="${verifyUrl}">${id}</a></td>
      <td>${fname}</td>
      <td>${dname}</td>
      <td><code class="hash">${hash}</code></td>
      <td>${mail}</td>
      <td>${created}</td>
      <td><a href="${viewUrl}">JSON</a> · <a href="${verifyUrl}">Verify</a></td>
    </tr>`;
}).join("");

const cards = items.map((r) => {
  const id = r.id || "—";
  const fname = r.filename || "—";
  const dname = r.displayName || "—";
  const hash = r.hash || "—";
  const mail = r.customerEmail || "—";
  const created = r.createdAt || "—";
  const viewUrl = `/.netlify/functions/view_proof?id=${encodeURIComponent(id)}`;
  const verifyUrl = `/.netlify/functions/verify_page?id=${encodeURIComponent(id)}`;
  return `
    <article class="card">
      <div class="row"><span class="label">Proof ID</span><span class="value"><a href="${verifyUrl}">${id}</a></span></div>
      <div class="row"><span class="label">Filename</span><span class="value">${fname}</span></div>
      <div class="row"><span class="label">Display Name</span><span class="value">${dname}</span></div>
      <div class="row"><span class="label">Hash</span><span class="value"><code>${hash}</code></span></div>
      <div class="row"><span class="label">Email</span><span class="value">${mail}</span></div>
      <div class="row"><span class="label">Created</span><span class="value">${created}</span></div>
      <div class="links"><a href="${viewUrl}">JSON</a> · <a href="${verifyUrl}">Verify</a></div>
    </article>`;
}).join("");

const emptyTable = `<tr><td colspan="7" style="text-align:center;color:#aaa;padding:16px;">No proofs yet.</td></tr>`;
const emptyCards = `<div style="text-align:center;color:#aaa;padding:16px;">No proofs yet.</div>`;
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
  /* Reset / containment */
  html,body{
    margin:0;
    padding:0;
    overflow-x:hidden;       /* prevents scrollbar creation */
    width:100%;
    background:#0b0d0f;
    color:#E6E7EB;
    font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;
  }

  main{
    max-width:1100px;
    margin:0 auto;           /* centers horizontally */
    padding:24px 16px 64px;  /* top/bottom balance */
    box-sizing:border-box;
  }

  /* Typography */
  h1{color:#16FF70;text-align:center;margin:0 0 20px}
  a{color:#16FF70;text-decoration:none}

  /* Controls row */
  .controls{
    display:flex;
    justify-content:center;
    flex-wrap:wrap;
    gap:8px;
    margin-bottom:20px;
  }
  input,button{font-size:14px;border-radius:6px}
  input[type="email"],input[type="number"]{
    padding:6px 8px;
    border:1px solid #333;
    background:#0e1012;
    color:#E6E7EB;
    width:200px;
    max-width:220px;
  }
  button{
    padding:6px 12px;
    border:none;
    background:#16FF70;
    color:#0b0d0f;
    cursor:pointer;
    font-weight:600;
  }
  button:hover{opacity:.9}
  .actions{text-align:center;margin-top:16px}

  /* Table (desktop) */
  .table-wrap{
    margin-top:20px;
    width:100%;
    box-sizing:border-box;
    overflow-x:hidden;
  }
  table{
  width:100%;
  border-collapse:collapse;
  table-layout:auto;          /* allow flexible column widths */
}
th,td{
  border-bottom:1px solid #222;
  padding:8px 10px;
  text-align:left;
  vertical-align:top;
  word-break:break-word;      /* allow breaking long text */
  overflow-wrap:anywhere;     /* allow wrapping even without spaces */
}
th{color:#9aa0a6;font-weight:600}
code{
  background:#111;
  padding:2px 4px;
  border-radius:4px;
  word-break:break-all;       /* safely break long hashes */
}
.hash{
  font-size:12px;             /* slightly smaller for long hashes */
}

  /* Optional layout refinements */
  td:nth-child(2) { max-width: 180px; }  /* Filename */
  td:nth-child(4) { max-width: 280px; }  /* Hash */
  td:nth-child(5) { max-width: 200px; }  /* Email */
  td:nth-child(6) { max-width: 140px; }  /* Created */
  td { word-wrap: break-word; }

  /* Cards (mobile) */
  .cards{display:none; gap:12px; margin-top:20px}
  .card{
    border:1px solid #222;
    border-radius:10px;
    padding:12px;
    background:#0e1012;
    width:100%;
    box-sizing:border-box;
  }
  .row{display:flex; gap:8px; margin:4px 0; flex-wrap:wrap}
  .label{color:#9aa0a6; min-width:110px}
  .value code{background:#111; padding:2px 4px; border-radius:4px}
  .links{margin-top:6px}

  /* Switch to cards below 900px */
  @media (max-width: 900px){
    .table-wrap{display:none}
    .cards{display:grid}
  }
</style>

</head>
<body>
  <main>
    <h1>${title}</h1>

    <div class="controls">
      <form action="/.netlify/functions/history" method="GET" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
        <label>Email filter:&nbsp;</label>
        <input type="email" name="email" value="${email || ""}" placeholder="user@example.com"/>
        <label>Limit:&nbsp;</label>
        <input type="number" name="limit" min="1" max="200" value="${limit}"/>
        <button type="submit">Apply</button>
        <a href="/.netlify/functions/history" style="align-self:center;">Clear</a>
      </form>
    </div>

    <div class="actions">
      <button onclick="navigator.clipboard.writeText(window.location.href)">Copy Link</button>
      <button id="csvBtn">Export CSV</button>
    </div>

    <div class="table-wrap">
  <table id="hist">
    <thead>
      <tr>
        <th>Proof ID</th>
        <th>Filename</th>
        <th>Display Name</th>
        <th>Hash</th>
        <th>Email</th>
        <th>Created</th>
        <th>Links</th>
      </tr>
    </thead>
    <tbody>
      ${items.length ? rows : emptyTable}
    </tbody>
  </table>
</div>

<div class="cards">
  ${items.length ? cards : emptyCards}
</div>

    <p style="margin-top:24px;"><a href="/">← Back to docuProof.io</a></p>
  </main>

  <script>
    // Safer CSV export (no tricky escapes)
    document.getElementById("csvBtn")?.addEventListener("click", () => {
      const rows = Array.from(document.querySelectorAll("#hist tr"));
      const csv = rows.map((r) => {
        const cols = Array.from(r.children).map((td) => {
          // collapse whitespace and escape quotes
          const txt = td.innerText.replace(/\\s+/g, " ").trim().replace(/"/g, '""');
          return \`"\${txt}"\`;
        });
        return cols.join(",");
      }).join("\\n");

      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "proof_history.csv";
      a.click();
      URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html" },
      body: html,
    };
  } catch (err) {
    console.error("[history] fatal:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: "Internal error",
    };
  }
};