// netlify/functions/proof_pdf.js
// v5.3.1 — stable binary PDF + reserved right column for QR (no overlap)

const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

function mm(n) { return (n * 72) / 25.4; } // millimeters → points

exports.handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const id        = qp.id || "unknown";
  const filename  = qp.filename || "docuProof.pdf";
  const display   = qp.displayName || "Untitled";
  const verifyUrl = qp.verifyUrl || `https://docuproof.io/.netlify/functions/verify_page?id=${encodeURIComponent(id)}`;
  const quickId   = qp.quickId || "----------";

  try {
    const doc = new PDFDocument({
      size: "A4",
      margin: mm(14),
      info: { Title: "docuProof Certificate" },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((resolve) =>
      doc.on("end", () => resolve(Buffer.concat(chunks)))
    );

    const pageW  = doc.page.width;
    const pageH  = doc.page.height;
    const leftX  = doc.page.margins.left;
    const rightX = pageW - doc.page.margins.right;

    // === QR COLUMN GEOMETRY (reserved) ===
    const qrBoxW    = mm(42);
    const qrX       = rightX - qrBoxW;
    const qrY       = mm(60);
    const qrPadding = mm(3);

    // Left column bounds (all text stays here)
    const summaryRight = qrX - mm(4);        // gutter before QR column
    const summaryWidth = summaryRight - leftX;

    // Key/value layout inside summary block
    const keyRight    = leftX + mm(32);
    const valueX      = leftX + mm(36);
    const valueWidth  = summaryRight - valueX;

    // Background
    doc.rect(0, 0, pageW, pageH).fill("#0b0d0f");

    // Header
    doc.font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#16FF70")
      .text(
        "docuProof.io — Proof you can point to.",
        leftX,
        mm(12),
        { width: summaryWidth }
      );

    // Logo (transparent PNG preferred)
    const logoPaths = [
      "./netlify/functions/assets/logo_nobg.png",
      "./netlify/functions/assets/logo.png",
    ];
    let logoUsed = null;
    for (const p of logoPaths) {
      if (fs.existsSync(p)) {
        logoUsed = p;
        break;
      }
    }
    if (logoUsed) {
      const w = mm(42);
      doc.image(logoUsed, rightX - w, mm(8), { width: w });
    }

    // Title + body
    doc.font("Helvetica-Bold")
      .fontSize(16)
      .fillColor("#E6E7EB")
      .text("Proof you can point to.", leftX, mm(26), {
        width: summaryWidth,
      });

    doc.font("Helvetica")
      .fontSize(9)
      .fillColor("#A8AAB0")
      .text(
        "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
        leftX,
        mm(33),
        { width: summaryWidth }
      );

    // Summary heading
    doc.font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#16FF70")
      .text("Proof Summary", leftX, mm(44), { width: summaryWidth });

    // Summary explanatory paragraph
    doc.font("Helvetica")
      .fontSize(9)
      .fillColor("#A8AAB0")
      .text(
        "This proof represents a cryptographic commitment to your original file. docuProof submits proofs to OpenTimestamps for batching and anchoring into the Bitcoin blockchain. Once anchored, anyone can independently verify this timestamp without relying on docuProof.",
        leftX,
        mm(48),
        { width: summaryWidth }
      );

    // Rows
    const rows = [
      ["Proof ID",         id,        "Unique identifier for this proof within docuProof."],
      ["Quick Verify ID",  quickId,   "Short form of the identifier for manual reference or logging."],
      [
        "Created (UTC)",
        new Date().toISOString().replace("T", " ").replace("Z", "Z"),
        "Time this certificate was generated (anchoring occurs after batching).",
      ],
      [
        "File Name",
        filename,
        "Human-readable name of the original document associated with this proof.",
      ],
      [
        "Display Name",
        display,
        "Descriptive title for this proof, provided by the user.",
      ],
      [
        "Public Verify URL",
        verifyUrl,
        "Shareable link to check live status and Bitcoin anchoring for this proof.",
      ],
    ];

    // Dynamic row layout: respect wrapped heights
    let y = mm(66);

    for (const [k, v, helper] of rows) {
      const rowTop = y;

      // Key label
      doc.font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#16FF70")
        .text(k, leftX, rowTop, {
          width: keyRight - leftX,
        });

      // Value text (can wrap to multiple lines)
      doc.font("Helvetica")
        .fontSize(9)
        .fillColor("#E6E7EB")
        .text(v, valueX, rowTop, {
          width: valueWidth,
        });

      const afterValueY = doc.y; // actual bottom of wrapped value

      let afterHelperY = afterValueY;
      if (helper) {
        doc.font("Helvetica")
          .fontSize(8)
          .fillColor("#A8AAB0")
          .text(helper, valueX, afterValueY + mm(1.5), {
            width: valueWidth,
          });
        afterHelperY = doc.y;
      }

      // Small gap before next row
      y = afterHelperY + mm(3);
    }

    // QR code
    const qrPng = await QRCode.toBuffer(verifyUrl, {
      width: 280,
      margin: 0,
      color: { dark: "#0b0d0f", light: "#16FF70" },
    });

    // Green patch + QR in reserved right column
    doc.rect(qrX, qrY, qrBoxW, qrBoxW).fill("#16FF70");
    doc.image(qrPng, qrX + qrPadding, qrY + qrPadding, {
      width: qrBoxW - 2 * qrPadding,
    });

    // Footer
    const footerY = pageH - mm(18);

    doc.font("Helvetica")
      .fontSize(8)
      .fillColor("#A8AAB0")
      .text(
        "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
        leftX,
        footerY,
        {
          width: rightX - leftX,
          align: "left",
        }
      );

    doc.end();
    const pdf = await done;
    const b64 = pdf.toString("base64");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Length": String(pdf.length),
        "x-docuproof-version": "proof_pdf v5.3.1",
      },
      body: b64,
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        ok: false,
        error: err.message,
        stack: err.stack?.split("\n").slice(0, 6),
      }),
    };
  }
};
