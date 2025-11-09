// netlify/functions/diag_pdf.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

exports.handler = async () => {
  // Where Netlify mounts your compiled functions
  const dir = __dirname; // e.g. /var/task/netlify/functions
  const target = path.join(dir, "proof_pdf.js");

  let exists = false, size = 0, sha256 = null, head = null, mtime = null, textHead = null;
  try {
    const stat = fs.statSync(target);
    exists = true;
    size = stat.size;
    mtime = stat.mtime?.toISOString?.() || String(stat.mtime);
    const buf = fs.readFileSync(target);
    sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    textHead = buf.slice(0, 240).toString("utf8");
    head = textHead.replace(/\r/g, "");
  } catch (e) {
    head = `read error: ${e.message}`;
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      function_dir: dir,
      target,
      exists,
      size,
      mtime,
      sha256,
      commit_ref: process.env.COMMIT_REF || null,
      // Helpful to spot which version is deployed:
      text_head_240: head,
    }, null, 2),
  };
};