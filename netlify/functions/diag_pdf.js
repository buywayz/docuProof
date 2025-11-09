// netlify/functions/diag_pdf.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOTS = ["/var/task"];

const NAME_HINTS = [
  "proof_pdf",                          // expected logical name
  ".netlify/functions/proof_pdf",       // new bundler layout
];

const CONTENT_HINTS = [
  "Proof you can point to.",
  "Quick Verify ID",
  "docuProof.io",
];

function sha256(p) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
  catch { return null; }
}

function head(p, n = 280) {
  try { return fs.readFileSync(p).slice(0, n).toString("utf8").replace(/\r/g, ""); }
  catch (e) { return `read error: ${e.message}`; }
}

function safeStat(p) { try { return fs.statSync(p); } catch { return null; } }

function* walk(dir, depth = 5) {
  if (depth < 0) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const d of ents) {
    const full = path.join(dir, d.name);
    yield full;
    if (d.isDirectory()) yield* walk(full, depth - 1);
  }
}

function looksLikeTarget(p) {
  const lower = p.toLowerCase();
  if (NAME_HINTS.some(h => lower.includes(h))) return true;
  // fast path: only test JS/MJS/CJS bundles for content
  if (!/\.(m?js|cjs)$/.test(lower)) return false;
  try {
    const buf = fs.readFileSync(p);
    const s = buf.slice(0, Math.min(buf.length, 4096)).toString("utf8");
    return CONTENT_HINTS.some(h => s.includes(h));
  } catch { return false; }
}

exports.handler = async () => {
  const hits = [];
  for (const root of ROOTS) {
    for (const p of walk(root, 6)) {
      const st = safeStat(p);
      if (!st || !st.isFile()) continue;
      if (!/\.(m?js|cjs)$/.test(p)) continue;        // only code bundles
      if (!looksLikeTarget(p)) continue;
      hits.push({
        path: p,
        size: st.size,
        mtime: st.mtime?.toISOString?.() || String(st.mtime),
        sha256: sha256(p),
        text_head_280: head(p, 280),
      });
    }
  }

  // also expose a short listing of likely folders for manual inspection
  const peekDirs = [
    "/var/task/.netlify/functions",
    "/var/task/.netlify/functions-internal",
    "/var/task/netlify/functions",
    "/var/task",
  ];
  const peeks = {};
  for (const d of peekDirs) {
    try {
      peeks[d] = fs.readdirSync(d).slice(0, 60);
    } catch { peeks[d] = "(unreadable)"; }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      commit_ref: process.env.COMMIT_REF || null,
      hits,
      peekDirs,
      env: {
        AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME || null,
        LAMBDA_TASK_ROOT: process.env.LAMBDA_TASK_ROOT || null,
        _HANDLER: process.env._HANDLER || null,
      },
    }, null, 2),
  };
};