// netlify/functions/diag_pdf.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function safeStat(p) {
  try { return fs.statSync(p); } catch { return null; }
}
function sha256File(p) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
  catch { return null; }
}
function headText(p, n = 240) {
  try { return fs.readFileSync(p).slice(0, n).toString("utf8").replace(/\r/g, ""); }
  catch (e) { return `read error: ${e.message}`; }
}
function list(dir, depth = 1) {
  const out = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = safeStat(full);
      if (!st) continue;
      out.push({ name, full, size: st.size, isDir: st.isDirectory() });
      if (depth > 0 && st.isDirectory()) out.push(...list(full, depth - 1));
    }
  } catch {}
  return out;
}

exports.handler = async () => {
  // Typical candidates Netlify uses for bundled functions:
  const roots = [
    "/var/task/netlify/functions",
    "/var/task",
    "/var/task/dist",
    "/var/task/functions",
  ];

  const candidates = [];
  for (const root of roots) {
    for (const base of [
      "proof_pdf.js",
      "proof_pdf/index.js",
      "proof_pdf.mjs",
      "proof_pdf/index.mjs",
    ]) {
      candidates.push(path.join(root, base));
    }
  }

  const hits = candidates
    .map(p => ({ path: p, stat: safeStat(p) }))
    .filter(x => x.stat && x.stat.isFile())
    .map(x => ({
      path: x.path,
      size: x.stat.size,
      mtime: x.stat.mtime?.toISOString?.() || String(x.stat.mtime),
      sha256: sha256File(x.path),
      text_head_240: headText(x.path),
    }));

  // Also list the top-level directories so we can see how Netlify laid it out
  const listings = {};
  for (const r of roots) listings[r] = list(r, 1);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      commit_ref: process.env.COMMIT_REF || null,
      roots,
      found: hits,
      listings,
    }, null, 2),
  };
};