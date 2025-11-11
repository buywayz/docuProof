// netlify/functions/proof_pdf.js
// Collision-proof layout for Letter (612x792 pt). QR column is fixed,
// left column is computed from remaining width. Acrobat-safe PDF.

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const proofId     = q.id || "qr_fix01";
    const quickId     = (q.quickId || "00000000").toString();
    const filename    = q.filename || "Launch-Test.pdf";
    const displayName = q.displayName || "Launch Sync Test";
    const verifyUrl   = q.verifyUrl || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;

    // ---- Theme
    const C_BG     = "#0b0d0f";
    const C_PANEL  = "#13171b";
    const C_TXT    = "#e6e7eb";
    const C_MUTED  = "#9aa1a8";
    const C_ACCENT = "#16FF70";
    const C_RULE   = "#252b31";
    const C_QR_BG  = "#90f9ad33";

    const MARGIN = 40;

    // Resolve logo
    const logo = (() => {
      const a = path.resolve("netlify/functions/assets/logo_nobg.png");
      const b = path.resolve("netlify/functions/assets/logo.png");
      return fs.existsSync(a) ? a : (fs.existsSync(b) ? b : null);
    })();

    // Build QR PNG buffer once
    const qrBuf = Buffer.from(
      (await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: "Q",
        margin: 2,
        color: { dark: "#000000", light: "#00000000" },
        scale: 8,
      })).split(",")[1],
      "base64"
    );

    // PDF
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN },
      info: { Title: `docuProof Certificate — ${proofId}`, Author: "docuProof.io" }
    });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((r) => doc.on("end", () => r(Buffer.concat(chunks))));

    // Background
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(C_BG);

    // Header
    const headerY = MARGIN - 4;
    if (logo) doc.image(logo, MARGIN, headerY - 6, { width: 28, height: 28 });
    const brandX = MARGIN + 36;
    doc.font("Helvetica-Bold").fontSize(24).fillColor(C_ACCENT).text("docuProof.io", brandX, headerY);
    doc.font("Helvetica-Bold").fontSize(24).fillColor(C_TXT).text(" — Proof you can point to.", doc.x, headerY);

    // Right mark
    if (logo) {
      const markW = 132;
      doc.image(logo, doc.page.width - MARGIN - markW, headerY + 8, { width: markW });
    }

    // Rule
    doc.moveTo(MARGIN, headerY + 42).lineTo(doc.page.width - MARGIN, headerY + 42)
       .lineWidth(1).strokeColor(C_RULE).stroke();

    // Panel
    const panelX = MARGIN;
    const panelY = headerY + 58;
    const panelW = doc.page.width - 2 * MARGIN; // on Letter: 612 - 80 = 532
    const panelH = doc.page.height - panelY - MARGIN;
    doc.roundedRect(panelX, panelY, panelW, panelH, 14).fillColor(C_PANEL).fill();

    // Title + subtitle
    const contentX = panelX + 24;
    let y = panelY + 20;
    doc.font("Helvetica-Bold").fontSize(32).fillColor(C_TXT).text("Proof you can point to.", contentX, y);
    y += 38;
    doc.font("Helvetica").fontSize(12.5).fillColor(C_MUTED).text(
      "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
      contentX, y, { width: panelW - 48, lineGap: 2 }
    );
    y += 36;

    // ---- Column math (collision-proof)
    // Reserve a fixed QR column on the right; left gets the rest.
    const QR_FRAME  = 232;          // outer square
    const QR_PAD    = 12;           // inner padding
    const GUTTER    = 28;           // space between columns
    const rightX    = panelX + panelW - 24 - QR_FRAME;
    const rightY    = panelY + 108;
    const leftX     = contentX;
    const leftW     = Math.max(260, rightX - GUTTER - leftX); // never negative

    // Section header
    doc.font("Helvetica-Bold").fontSize(16).fillColor(C_ACCENT).text("Proof Summary", leftX, y);
    y += 10;

    const LABEL_W = 130;
    const VAL_W   = leftW - LABEL_W - 12;
    const gapVal  = 2;
    const gapHelp = 1.2;

    const row = (label, value, help) => {
      // label
      doc.font("Helvetica-Bold").fontSize(13.5).fillColor(C_ACCENT)
         .text(label, leftX, y, { width: LABEL_W });

      // value
      doc.font("Helvetica-Bold").fontSize(16).fillColor(C_TXT)
         .text(value, leftX + LABEL_W + 12, y, { width: VAL_W, lineGap: gapVal });
      const vH = doc.heightOfString(value, { width: VAL_W, lineGap: gapVal, font: "Helvetica-Bold", fontSize: 16 });
      let rowBottom = y + vH;

      if (help) {
        const hy = rowBottom + 2;
        doc.font("Helvetica").fontSize(11.2).fillColor(C_MUTED)
           .text(help, leftX + LABEL_W + 12, hy, { width: VAL_W, lineGap: gapHelp });
        const hH = doc.heightOfString(help, { width: VAL_W, lineGap: gapHelp, font: "Helvetica", fontSize: 11.2 });
        rowBottom = hy + hH;
      }

      // divider
      const ruleY = rowBottom + 8;
      doc.moveTo(leftX, ruleY).lineTo(leftX + leftW, ruleY).lineWidth(0.8).strokeColor(C_RULE).stroke();
      y = ruleY + 10;
    };

    // Rows with helpers
    row("Proof ID", proofId, "Your permanent reference for this proof. Keep it with your records.");
    row("Quick Verify ID", quickId, "10-character code you can paste at docuProof.io/verify for fast lookups.");
    row("Created (UTC)", new Date().toISOString().replace("Z", "Z"), "Timestamp when this PDF was generated on the server.");
    row("File Name", filename, "Original filename you submitted for hashing.");
    row("Display Name", displayName, "Human-friendly name that appears on your proof.");
    row("Public Verify URL", verifyUrl, "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.");

    // QR block
    doc.roundedRect(rightX, rightY, QR_FRAME, QR_FRAME, 12).fillColor(C_QR_BG).fill();
    const inner = QR_FRAME - 2 * QR_PAD;
    doc.image(qrBuf, rightX + QR_PAD, rightY + QR_PAD, { width: inner, height: inner });

    // Footer
    const footY = panelY + panelH - 18;
    doc.font("Helvetica").fontSize(9.5).fillColor(C_MUTED).text(
      "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
      MARGIN, footY, { width: doc.page.width - 2 * MARGIN, align: "center" }
    );

    doc.end();
    const pdf = await done;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Strict-Transport-Security": "max-age=31536000",
        "x-docuproof-version": "proof_pdf v6.2.0 geometry-safe"
      },
      isBase64Encoded: true,
      body: pdf.toString("base64")
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok:false, error:"PDF build failed", detail: err.message })
    };
  }
};