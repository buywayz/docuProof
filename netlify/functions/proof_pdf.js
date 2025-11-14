// netlify/functions/proof_pdf.js
// v5.2.2 — stable binary PDF for all clients (Acrobat-safe) + one-page layout

const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

function mm(n) { return (n * 72) / 25.4; } // millimeters → points

exports.handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const id         = qp.id || "unknown";
  const filename   = qp.filename || "docuProof.pdf";
  const display    = qp.displayName || "Untitled";
  const verifyUrl  = qp.verifyUrl || `https://docuproof.io/verify?id=${encodeURIComponent(id)}`;
  const quickId    = qp.quickId || "----------";

  try {
    // --- Build PDF in-memory ---
    const doc = new PDFDocument({
      size: "A4",
      margin: mm(14), // ~0.55"
      info: { Title: "docuProof Certificate" }
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    // Background
    const pageW = doc.page.width, pageH = doc.page.height;
    doc.rect(0, 0, pageW, pageH).fill("#0b0d0f");

    // Header
    const leftX = doc.page.margins.left, rightX = pageW - doc.page.margins.right;
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#16FF70")
       .text("docuProof.io — Proof you can point to.", leftX, mm(12), { width: rightX - leftX });

    // Logo (transparent PNG preferred)
    const logoPaths = [
      "./netlify/functions/assets/logo_nobg.png",
      "./netlify/functions/assets/logo.png",
    ];
    let logoUsed = null;
    for (const p of logoPaths) { if (fs.existsSync(p)) { logoUsed = p; break; } }
    if (logoUsed) {
      const w = mm(42);
      doc.image(logoUsed, rightX - w, mm(8), { width: w });
    }

    // Divider
    doc.moveTo(leftX, mm(22)).lineTo(rightX, mm(22))
       .strokeColor("#1a1f24").opacity(0.6).stroke().opacity(1);

    // Title + body
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#E6E7EB")
       .text("Proof you can point to.", leftX, mm(26));
    doc.font("Helvetica").fontSize(9).fillColor("#A8AAB0")
       .text(
         "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
         leftX, mm(33), { width: mm(120) }
       );

    // Summary block
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#16FF70").text("Proof Summary", leftX, mm(44));

    const rows = [
      ["Proof ID", id],
      ["Quick Verify ID", quickId],
      ["Created (UTC)", new Date().toISOString().replace("T", " ").replace("Z","Z")],
      ["File Name", filename],
      ["Display Name", display],
      ["Public Verify URL", verifyUrl],
    ];

    let y = mm(50);
    rows.forEach(([k, v]) => {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#16FF70").text(k, leftX, y);
      doc.font("Helvetica").fontSize(9).fillColor("#E6E7EB").text(v, leftX + mm(36), y, {
        width: mm(120), continued: false
      });
      y += mm(6);
    });

    // QR code (dark on brand green, size tuned)
    const qrPng = await QRCode.toBuffer(verifyUrl, {
      width: 280, // device pixels (we scale via image width below)
      margin: 0,
      color: { dark: "#0b0d0f", light: "#16FF70" } // invert to make modules dark on green patch
    });

    // Green patch to ensure contrast
    const qrBoxW = mm(48), qrX = rightX - qrBoxW, qrY = mm(56);
    doc.rect(qrX, qrY, qrBoxW, qrBoxW).fill("#16FF70");
    doc.image(qrPng, qrX + mm(3), qrY + mm(3), { width: qrBoxW - mm(6) });

        // Footer — fixed position on page 1, never spills to a second page
    const footerY = pageH - mm(18);  // 18 mm up from bottom

    doc.font("Helvetica")
       .fontSize(8)                  // a touch smaller than body copy
       .fillColor("#A8AAB0")
       .text(
         "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
         leftX,
         footerY,
         {
           width: rightX - leftX,
           align: "left"
         }
       );

    doc.end();
    const pdf = await done;                  // <— Buffer (binary bytes)
    const b64 = pdf.toString("base64");

    // Stable, Acrobat-safe response
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Length": String(pdf.length),                // important for some clients
        "x-docuproof-version": "proof_pdf v5.2.2",
      },
      body: b64,
      isBase64Encoded: true,                                  // platform decodes to binary on the wire
    };

  } catch (err) {
    // If anything breaks, return JSON (not a .pdf) so we never save garbage to a PDF file.
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: false, error: err.message, stack: err.stack?.split("\n").slice(0,6) }),
    };
  }
};