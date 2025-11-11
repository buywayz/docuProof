// netlify/functions/proof_pdf.js
// Fixed-geometry layout: wide left column (560pt) + helper lines; QR at right.
// Acrobat-safe output (base64), explicit widths to prevent wrap/compression bugs.

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const proofId     = q.id || "qr_fix01";
    const quickId     = (q.quickId || "00000000").toString();
    const filename    = q.filename || "Launch-Test.pdf";
    const displayName = q.displayName || "Launch Sync Test";
    const verifyUrl   = q.verifyUrl || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;

    // ---- Colors & sizes
    const C_BG      = "#0b0d0f";
    const C_PANEL   = "#13171b";
    const C_TXT     = "#e6e7eb";
    const C_MUTED   = "#9aa1a8";
    const C_ACCENT  = "#16FF70";
    const C_RULE    = "#252b31";
    const C_QR_FILL = "#90f9ad33";

    const MARGIN = 40;

    // Fixed geometry matching your “#2” reference
    const LEFT_COL_W = 560;       // wide table column
    const GUTTER     = 36;        // space between table and QR
    const QR_BOX     = 260;       // outer frame size
    const QR_PAD     = 14;        // inner padding inside frame

    const resolveLogo = () => {
      const p1 = path.resolve("netlify/functions/assets/logo_nobg.png");
      const p2 = path.resolve("netlify/functions/assets/logo.png");
      if (fs.existsSync(p1)) return p1;
      if (fs.existsSync(p2)) return p2;
      return null;
    };
    const LOGO = resolveLogo();

    // Build QR
    const qrPngDataUrl = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: "Q",
      margin: 2,
      color: { dark: "#000000", light: "#00000000" },
      scale: 8,
    });
    const qrPng = Buffer.from(qrPngDataUrl.split(",")[1], "base64");

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
    if (LOGO) doc.image(LOGO, MARGIN, headerY - 6, { width: 28, height: 28 });
    const brandX = MARGIN + 36;
    doc.font("Helvetica-Bold").fontSize(24).fillColor(C_ACCENT).text("docuProof.io", brandX, headerY);
    doc.font("Helvetica-Bold").fontSize(24).fillColor(C_TXT).text(" — Proof you can point to.", doc.x, headerY);

    // Right logo mark (same feel as your ref)
    if (LOGO) {
      const markW = 140;
      const markX = doc.page.width - MARGIN - markW;
      doc.image(LOGO, markX, headerY + 10, { width: markW });
    }

    // Header rule
    doc.moveTo(MARGIN, headerY + 42).lineTo(doc.page.width - MARGIN, headerY + 42)
       .lineWidth(1).strokeColor(C_RULE).stroke();

    // Panel
    const panelX = MARGIN;
    const panelY = headerY + 58;
    const panelW = doc.page.width - MARGIN * 2;
    const panelH = doc.page.height - panelY - MARGIN;
    doc.roundedRect(panelX, panelY, panelW, panelH, 14).fillColor(C_PANEL).fill();

    // Title + subtitle
    const contentX = panelX + 28;
    let y = panelY + 24;
    doc.font("Helvetica-Bold").fontSize(34).fillColor(C_TXT).text("Proof you can point to.", contentX, y);
    y += 40;
    doc.font("Helvetica").fontSize(12.5).fillColor(C_MUTED).text(
      "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
      contentX, y, { width: panelW - 56, lineGap: 2 }
    );

    // Columns (fixed)
    y += 38;
    const leftX  = contentX;
    const leftW  = LEFT_COL_W; // fixed
    const rightX = panelX + panelW - 28 - QR_BOX; // QR frame outer X
    const rightY = panelY + 112;

    // Section header
    doc.font("Helvetica-Bold").fontSize(16).fillColor(C_ACCENT).text("Proof Summary", leftX, y);
    y += 10;

    // Row renderer with fixed widths
    const LABEL_W = 130;
    const VALUE_W = leftW - LABEL_W - 12;
    const lineGapValue = 2;
    const lineGapHelp  = 1.2;

    const row = (label, value, help) => {
      // Label
      doc.font("Helvetica-Bold").fontSize(13.5).fillColor(C_ACCENT)
         .text(label, leftX, y, { width: LABEL_W, lineGap: 0 });

      // Value
      doc.font("Helvetica-Bold").fontSize(16).fillColor(C_TXT)
         .text(value, leftX + LABEL_W + 12, y, { width: VALUE_W, lineGap: lineGapValue });

      // Measure vertical advance: compute tallest block height we just used
      const valueHeight = doc.heightOfString(value, { width: VALUE_W, lineGap: lineGapValue, font: "Helvetica-Bold", fontSize: 16 });
      let rowBottom = y + valueHeight;

      if (help) {
        const helpY = rowBottom + 2;
        doc.font("Helvetica").fontSize(11.2).fillColor(C_MUTED)
           .text(help, leftX + LABEL_W + 12, helpY, { width: VALUE_W, lineGap: lineGapHelp });
        const helpH = doc.heightOfString(help, { width: VALUE_W, lineGap: lineGapHelp, font: "Helvetica", fontSize: 11.2 });
        rowBottom = helpY + helpH;
      }

      // Divider
      const ruleY = rowBottom + 8;
      doc.moveTo(leftX, ruleY).lineTo(leftX + leftW, ruleY).lineWidth(0.8).strokeColor(C_RULE).stroke();

      y = ruleY + 10; // next row start
    };

    // Rows + helpers
    row("Proof ID", proofId, "Your permanent reference for this proof. Keep it with your records.");
    row("Quick Verify ID", quickId, "10-character code you can paste at docuProof.io/verify for fast lookups.");
    row("Created (UTC)", new Date().toISOString().replace("Z","Z"), "Timestamp when this PDF was generated on the server.");
    row("File Name", filename, "Original filename you submitted for hashing.");
    row("Display Name", displayName, "Human-friendly name that appears on your proof.");
    row("Public Verify URL", verifyUrl, "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.");

    // QR frame + image (right column)
    doc.roundedRect(rightX, rightY, QR_BOX, QR_BOX, 12).fillColor(C_QR_FILL).fill();
    const qrInner = QR_BOX - 2 * QR_PAD;
    doc.image(qrPng, rightX + QR_PAD, rightY + QR_PAD, { width: qrInner, height: qrInner });

    // Footer legal
    const footY = panelY + panelH - 18;
    doc.font("Helvetica").fontSize(9.5).fillColor(C_MUTED)
       .text(
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
        "x-docuproof-version": "proof_pdf v6.1.0 fixed-geometry"
      },
      isBase64Encoded: true,
      body: pdf.toString("base64")
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "PDF build failed", detail: err.message })
    };
  }
};