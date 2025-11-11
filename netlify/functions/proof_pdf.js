// netlify/functions/proof_pdf.js
// PDFKit layout: compact left column + helper text; QR at right with green frame.
// Opens cleanly in Acrobat (base64), no partial streams.

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

exports.handler = async (event) => {
  try {
    // ---- Parse inputs -------------------------------------------------------
    const q = event.queryStringParameters || {};
    const proofId     = q.id || "qr_fix01";
    const quickId     = (q.quickId || "00000000").toString();
    const filename    = q.filename || "Launch-Test.pdf";
    const displayName = q.displayName || "Launch Sync Test";
    const verifyUrl   =
      q.verifyUrl ||
      `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;

    // ---- Theme & layout constants ------------------------------------------
    const COLOR_BG       = "#0b0d0f";
    const COLOR_PANEL    = "#13171b";
    const COLOR_TEXT     = "#e6e7eb";
    const COLOR_MUTED    = "#9aa1a8";
    const COLOR_ACCENT   = "#16FF70";
    const COLOR_DIVIDER  = "#252b31";
    const COLOR_QR_BG    = "#90f9ad33"; // light accent for frame fill
    const MARGIN         = 40;

    // Header logo (transparent if available)
    function resolveLogo() {
      const p1 = path.resolve("netlify/functions/assets/logo_nobg.png");
      const p2 = path.resolve("netlify/functions/assets/logo.png");
      if (fs.existsSync(p1)) return p1;
      if (fs.existsSync(p2)) return p2;
      return null;
    }
    const LOGO_PATH = resolveLogo();

    // ---- Build QR (PNG data URL → Buffer) -----------------------------------
    const qrPngDataUrl = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: "Q",
      margin: 2,
      color: { dark: "#000000", light: "#00000000" },
      scale: 8,
    });
    const qrPng = Buffer.from(qrPngDataUrl.split(",")[1], "base64");

    // ---- Create PDF ---------------------------------------------------------
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN },
      info: {
        Title: `docuProof Certificate — ${proofId}`,
        Author: "docuProof.io",
        Producer: "PDFKit",
      },
    });

    // Collect into a single buffer
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));

    // Background
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR_BG);

    // Header
    const headerY = MARGIN - 4;
    doc.fillColor(COLOR_TEXT);
    // small logo at far left
    if (LOGO_PATH) {
      doc.image(LOGO_PATH, MARGIN, headerY - 6, { width: 28, height: 28 });
    }
    // brand line
    const brandX = MARGIN + 36;
    doc
      .font("Helvetica-Bold")
      .fontSize(24)
      .fillColor(COLOR_ACCENT)
      .text("docuProof.io", brandX, headerY, { continued: true });
    doc
      .fillColor(COLOR_TEXT)
      .text(" — Proof you can point to.", { continued: false });

    // Logo mark on right (keep as-is; same size/placement feel as your ref)
    if (LOGO_PATH) {
      const markW = 140;
      const markX = doc.page.width - MARGIN - markW;
      const markY = headerY + 10;
      doc.image(LOGO_PATH, markX, markY, { width: markW });
    }

    // Divider
    doc
      .moveTo(MARGIN, headerY + 42)
      .lineTo(doc.page.width - MARGIN, headerY + 42)
      .lineWidth(1)
      .strokeColor(COLOR_DIVIDER)
      .stroke();

    // Card panel
    const panelX = MARGIN;
    const panelY = headerY + 58;
    const panelW = doc.page.width - MARGIN * 2;
    const panelH = doc.page.height - panelY - MARGIN;
    doc
      .roundedRect(panelX, panelY, panelW, panelH, 14)
      .fillColor(COLOR_PANEL)
      .fill();

    // Title + subtitle
    const contentX = panelX + 28;
    let cursorY = panelY + 24;

    doc
      .font("Helvetica-Bold")
      .fontSize(34)
      .fillColor(COLOR_TEXT)
      .text("Proof you can point to.", contentX, cursorY);

    cursorY += 40;
    doc
      .font("Helvetica")
      .fontSize(12.5)
      .fillColor(COLOR_MUTED)
      .text(
        "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
        contentX,
        cursorY,
        { width: panelW - 56 }
      );

    // Layout columns (left table & right QR)
    const colGap = 36;
    const qrBoxSize = 260;       // QR frame outer size
    const qrInnerPad = 14;       // frame padding
    const rightColW = qrBoxSize;
    const rightColX = panelX + panelW - 28 - rightColW;
    const leftColX = contentX;
    const leftColW = rightColX - leftColX - colGap;

    // Section header
    cursorY += 38;
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(COLOR_ACCENT)
      .text("Proof Summary", leftColX, cursorY);

    // Helper to draw one row (label/value/helper + divider)
    cursorY += 10;
    const row = (label, value, help) => {
      const labelW = 130;
      const lineY1 = cursorY + 22;
      // Label
      doc
        .font("Helvetica-Bold")
        .fontSize(13.5)
        .fillColor(COLOR_ACCENT)
        .text(label, leftColX, cursorY, { width: labelW });
      // Value
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor(COLOR_TEXT)
        .text(value, leftColX + labelW + 12, cursorY, {
          width: leftColW - labelW - 12,
        });
      // Helper
      if (help) {
        cursorY += 18;
        doc
          .font("Helvetica")
          .fontSize(11.2)
          .fillColor(COLOR_MUTED)
          .text(help, leftColX + labelW + 12, cursorY, {
            width: leftColW - labelW - 12,
          });
      }
      // Divider
      doc
        .moveTo(leftColX, lineY1 + 14)
        .lineTo(leftColX + leftColW, lineY1 + 14)
        .lineWidth(0.8)
        .strokeColor(COLOR_DIVIDER)
        .stroke();

      cursorY = lineY1 + 22; // next row start
    };

    // Rows (with helper text)
    row("Proof ID", proofId, "Your permanent reference for this proof. Keep it with your records.");
    row("Quick Verify ID", quickId, "10-character code you can paste at docuProof.io/verify for fast lookups.");
    row("Created (UTC)", new Date().toISOString().replace("Z", "Z"), "Timestamp when this PDF was generated on the server.");
    row("File Name", filename, "Original filename you submitted for hashing.");
    row("Display Name", displayName, "Human-friendly name that appears on your proof.");
    row("Public Verify URL", verifyUrl, "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.");

    // QR frame + image (right column)
    const qrFrameX = rightColX;
    const qrFrameY = panelY + 112; // visually balanced with left table
    doc
      .roundedRect(qrFrameX, qrFrameY, qrBoxSize, qrBoxSize, 12)
      .fillColor(COLOR_QR_BG)
      .fill();
    const qrInner = qrBoxSize - qrInnerPad * 2;
    doc.image(qrPng, qrFrameX + qrInnerPad, qrFrameY + qrInnerPad, {
      width: qrInner,
      height: qrInner,
    });

    // Footer legal
    const footY = panelY + panelH - 18;
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLOR_MUTED)
      .text(
        "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
        MARGIN,
        footY,
        { width: doc.page.width - MARGIN * 2, align: "center" }
      );

    // Finalize
    doc.end();
    const pdfBuffer = await done;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store,no-cache,must-revalidate",
        "Strict-Transport-Security": "max-age=31536000",
        "x-docuproof-version": "proof_pdf v6.0.0",
      },
      isBase64Encoded: true,
      body: pdfBuffer.toString("base64"),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "PDF build failed",
        detail: err.message,
      }),
    };
  }
};