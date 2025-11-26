// netlify/functions/proof_pdf.js
// v5.3.0 — stable binary PDF + reserved right column for QR (no overlap)

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

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const leftX = doc.page.margins.left;
    const rightX = pageW - doc.page.margins.right;

    // === QR COLUMN GEOMETRY (reserve this from the start) ===
    const qrBoxW = mm(42);             // width of green QR patch
    const qrX = rightX - qrBoxW;       // right column start (QR box)
    const qrY = mm(60);                // vertical position for QR box
    const qrPadding = mm(3);           // padding inside green patch

    // Left column max width (all summary text stays here)
    const summaryRight = qrX - mm(4);  // 4mm gutter between text and QR
    const summaryWidth = summaryRight - leftX;

    // Value column inside summary block
    const valueX = leftX + mm(36);
    const valueWidth = summaryRight - valueX;

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

    // Title + body (confined to summaryWidth)
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

    // Summary block heading
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

    // Summary rows with helper text
    const rows = [
      ["Proof ID", id, "Unique identifier for this proof within docuProof."],
      ["Quick Verify ID", quickId, "Short form of the identifier for manual reference or logging."],
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

    let y = mm(66); // rows start; comfortably below the paragraph

    for (const [k, v, helper] of rows) {
      // Key
      doc.font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#16FF70")
        .text(k, leftX, y, { width: valueX - leftX - mm(2) });

      // Value (confined within left column, never under QR)
      doc.font("Helvetica")
        .fontSize(9)
        .fillColor("#E6E7EB")
        .text(v, valueX, y, {
          width: valueWidth,
        });

      // Helper
      if (helper) {
        doc.font("Helvetica")
          .fontSize(8)
          .fillColor("#A8AAB0")
          .text(helper, valueX, y + mm(3.2), {
            width: valueWidth,
          });
        y += mm(11);
      } else {
        y += mm(8);
      }
    }

    // QR code buffer (using verifyUrl)
    const qrPng = await QRCode.toBuffer(verifyUrl, {
      width: 280,
      margin: 0,
      color: { dark: "#0b0d0f", light: "#16FF70" },
    });

    // Green patch + QR, fully in reserved right column
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
        "x-docuproof-version": "proof_pdf v5.3.0",
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
