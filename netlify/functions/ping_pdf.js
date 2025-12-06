// netlify/functions/ping_pdf.js
const fs = require("fs");
exports.handler = async () => {
  const here = __dirname;
  let listing = [];
  try { listing = fs.readdirSync(here).sort(); } catch(e) {}
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "X-DocuProof-Function": "ping_pdf::v1"
    },
    body: JSON.stringify({
      ok: true,
      tag: "ping_pdf::v1",
      dirname: here,
      has_proof_pdf: listing.includes("proof_pdf.js"),
      files_here: listing.slice(0, 25)
    })
  };
};