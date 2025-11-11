// netlify/functions/proof_pdf.js
// PDFKit layout tuned to your “example” look: compact left column + helper lines,
// small header logo at top-left, medium QR on right, balanced spacing.

const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const COLOR_BG = "#0b0d0f";
const COLOR_PANEL = "#121418";
const COLOR_TEXT = "#e6e7eb";
const COLOR_MUTED = "#a7adb4";
const COLOR_LIME = "#16FF70";
const COLOR_LIME_2 = "#9BFFA7"; // tile ring

// Resolve an asset from the functions bundle
function assetPath(rel) {
  const candidates = [
    path.join(__dirname, "assets", rel),
    path.join(__dirname, "netlify", "functions", "assets", rel),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function drawHeader(doc, title) {
  const margin = 42;
  doc.rect(0, 0, doc.page.width, 72).fill(COLOR_BG);
  const logoP = assetPath("logo_nobg.png") || assetPath("logo.png");
  const logoH = 24;

  if (logoP) {
    try {
      doc.image(logoP, margin, 24, { height: logoH });
    } catch {}
  }
  doc
    .fillColor(COLOR_LIME)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("docuProof.io", margin + 36, 24, { continued: true });
  doc
    .fillColor(COLOR_TEXT)
    .font("Helvetica")
    .text("  —  " + title);
  doc
    .moveTo(margin, 72)
    .lineTo(doc.page.width - margin, 72)
    .lineWidth(1)
    .strokeColor("#1a1f24")
    .stroke();
  doc.fillColor(COLOR_TEXT);
}

function field(doc, x, y, label, value, help, colW) {
  const LABEL = 12;
  const VALUE = 16;
  const HELP = 10;

  doc.font("Helvetica-Bold").fontSize(LABEL).fillColor(COLOR_LIME).text(label, x, y);
  const afterLabel = y + 4;
  doc
    .font("Helvetica-Bold")
    .fontSize(VALUE)
    .fillColor(COLOR_TEXT)
    .text(value, x, afterLabel + 10, { width: colW });

  if (help) {
    doc
      .font("Helvetica")
      .fontSize(HELP)
      .fillColor(COLOR_MUTED)
      .text(help, x, afterLabel + 32, { width: colW });
  }

  // divider
  doc
    .moveTo(x, afterLabel + 46)
    .lineTo(x + colW, afterLabel + 46)
    .lineWidth(0.7)
    .strokeColor("#22272e")
    .stroke();

  return afterLabel + 56; // next Y
}

async function makeQrPng(data, size) {
  return await QRCode.toBuffer(data, {
    errorCorrectionLevel: "M",
    margin: 1,
    color: { dark: "#000000", light: "#00000000" },
    width: size,
    type: "png",
  });
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};

    const proofId = q.id || "qr_fix01";
    const filename = q.filename || "Launch-Test.pdf";
    const displayName = q.displayName || "Launch Sync Test";
    const verifyUrl = q.verifyUrl || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;
    const quickId = (q.quickId || "00000000").toString();
    const created = new Date().toISOString();

    // Create PDF
    const doc = new PDFDocument({
      size: "LETTER", // 612 x 792
      margins: { top: 84, left: 42, right: 42, bottom: 48 },
    });

    // Collect into buffer
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((res) => doc.on("end", () => res(Buffer.concat(chunks))));

    // Background panel
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR_BG);
    drawHeader(doc, "Proof you can point to.");

    const panelX = 28;
    const panelY = 96;
    const panelW = doc.page.width - 56;
    const panelH = doc.page.height - panelY - 32;
    doc
      .roundedRect(panelX, panelY, panelW, panelH, 14)
      .fillColor(COLOR_PANEL)
      .fill()
      .fillColor(COLOR_TEXT);

    // Title
    const innerX = panelX + 32;
    let y = panelY + 28;
    doc.font("Helvetica-Bold").fontSize(34).fillColor(COLOR_TEXT).text("Proof you can point to.", innerX, y);
    y += 40;

    // Blurb
    doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor(COLOR_MUTED)
      .text(
        "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
        innerX,
        y,
        { width: panelW - 64 }
      );
    y += 32;

    // Two-column layout
    const leftW = Math.floor((panelW - 64) * 0.60); // tighter, like your example
    const rightW = Math.floor((panelW - 64) * 0.40);
    const leftX = innerX;
    const rightX = innerX + leftW + 24;
    let leftY = y + 6;

    // Section header
    doc.font("Helvetica-Bold").fontSize(20).fillColor(COLOR_LIME).text("Proof Summary", leftX, leftY);
    leftY += 18;

    // Fields (label, value, helper)
    leftY = field(
      doc,
      leftX,
      leftY + 8,
      "Proof ID",
      proofId,
      "Your permanent reference for this proof. Keep it with your records.",
      leftW - 24
    );
    leftY = field(
      doc,
      leftX,
      leftY,
      "Quick Verify ID",
      quickId,
      "10-character code you can paste at docuProof.io/verify for fast lookups.",
      leftW - 24
    );
    leftY = field(
      doc,
      leftX,
      leftY,
      "Created (UTC)",
      created,
      "Timestamp when this PDF was generated on the server.",
      leftW - 24
    );
    leftY = field(
      doc,
      leftX,
      leftY,
      "File Name",
      filename,
      "Original filename you submitted for hashing.",
      leftW - 24
    );
    leftY = field(
      doc,
      leftX,
      leftY,
      "Display Name",
      displayName,
      "Human-friendly name that appears on your proof.",
      leftW - 24
    );
    leftY = field(
      doc,
      leftX,
      leftY,
      "Public Verify URL",
      verifyUrl,
      "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.",
      leftW - 24
    );

    // QR tile on the right
    const qrOuter = 300;            // overall tile (smaller than before)
    const qrPad = 18;               // tile padding
    const qrInner = qrOuter - qrPad * 2;

    // QR frame
    const qrTop = y; // align with paragraph block
    doc
      .roundedRect(rightX, qrTop, qrOuter, qrOuter, 10)
      .fillColor(COLOR_LIME_2)
      .fill();

    // QR image (transparent background)
    const qrBuf = await makeQrPng(verifyUrl, qrInner);
    doc.image(qrBuf, rightX + qrPad, qrTop + qrPad, { width: qrInner, height: qrInner });

    // Finish
    doc.end();
    const pdf = await done;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store,no-cache,must-revalidate",
        "X-docuproof-version": "proof_pdf v5.3.0 layout-match",
      },
      isBase64Encoded: true,
      body: pdf.toString("base64"),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "PDF build failed", detail: String(err && err.message) }),
    };
  }
};