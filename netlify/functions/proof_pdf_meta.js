// netlify/functions/proof_pdf_meta.js
// Helper: given ?id=cs_..., look up proof metadata in Blobs and redirect
// to proof_pdf with filename/displayName/quickId filled in.

const { getProof } = require("./_db");

// Small helper: derive a compact id from a hex hash (no external deps)
function shortIdFromHash(h) {
  if (!h || typeof h !== "string") return "----------";
  const m = h.toLowerCase().match(/[0-9a-f]{12,}/);
  return m ? m[0].slice(0, 12) : "----------";
}

exports.handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const id = (qp.id || "").trim();

  if (!id) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: false, error: "Missing id" }),
    };
  }

  let filename = "docuProof.pdf";
  let displayName = "Untitled";
  let quickId = "----------";
  let verifyUrl =
    `https://docuproof.io/.netlify/functions/verify_page?id=${encodeURIComponent(id)}`;

  try {
    const proof = await getProof(id);
    if (proof && typeof proof === "object") {
      if (proof.filename && typeof proof.filename === "string") {
        filename = proof.filename;
      }
      if (proof.displayName && typeof proof.displayName === "string") {
        displayName = proof.displayName;
      }
      if (proof.hash && typeof proof.hash === "string") {
        quickId = shortIdFromHash(proof.hash);
      }
    }
  } catch (e) {
    // If lookup fails, we just fall back to defaults
    console.error("proof_pdf_meta getProof error:", e);
  }

  const params = new URLSearchParams({
    id,
    filename,
    displayName,
    quickId,
    verifyUrl,
  });

  return {
    statusCode: 302,
    headers: {
      Location: `/.netlify/functions/proof_pdf?${params.toString()}`,
      "Cache-Control": "no-store",
    },
    body: "",
  };
};
