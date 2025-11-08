// netlify/functions/logo_diag.js
// Verify that the logo file used by proof_pdf.js is present at runtime.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

exports.handler = async () => {
  try {
    const logoPath = path.resolve(__dirname, "assets/logo.png");

    const exists = fs.existsSync(logoPath);
    let size = 0, sha = null;

    if (exists) {
      const buf = fs.readFileSync(logoPath);
      size = buf.length;
      sha = crypto.createHash("sha256").update(buf).digest("hex");
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        __dirname,
        logoPath,
        exists,
        size,
        sha256: sha,
        hint: "proof_pdf.js expects netlify/functions/assets/logo.png (bundled via netlify.toml included_files)."
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};