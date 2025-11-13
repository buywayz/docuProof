// netlify/functions/proof_pdf.js
//
// FINAL LAYOUT: robust two-column engine with measured rows (no overlap),
// transparent logo enforced, smaller QR, balanced typography.
// Binary (base64) response so Acrobat/Preview open cleanly.
//
// Requires (already in your project):
//   pdfkit
//   qrcode
//
// Bundled with repo (you already committed these):
//   netlify/functions/data/Helvetica*.afm
//   netlify/functions/assets/logo_nobg.png

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

// ---------- Tunables (safe to nudge) ----------
const PALETTE = {
  bg: "#0b0d0f",
  card: "#14181c",
  white: "#E6E7EB",
  gray: "#9aa3ab",
  green: "#16FF70",
  greenDim: "#9dfcc9",
  line: "#1a1f24",
};

const MARGIN = 36;

const TYPE = {
  title: 15.0,
  label: 8.0,
  value: 8.0,
  help: 7.2,
  header: 10.5, // "docuProof.io — Proof you can point to."
};

const GEOM = {
  pageW: 1200,
  pageH: 630,
  cardR: 20,
  headerH: 46,
  rowPad: 12,            // vertical space between rows (increase if you want more air)
  labelColX: MARGIN,
  valueColX: MARGIN + 175, // pushes value right so long labels never collide
  columnGutter: 32,      // space between text column and QR column
  qrEdge: 270,           // overall QR edge (inner black squares scale automatically)
  qrFrame: 18,           // green frame thickness around QR
  logoW: 30,             // header logo width (slightly larger, still subtle)
};

// ---------- Helpers ----------
function afm(p) {
  return path.join(__dirname, "data", p);
}
function asset(p) {
  return path.join(__dirname, "assets", p);
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function drawHeader(doc, leftX, topY, text) {
  // transparent logo only; never fall back to non-transparent
  const logoPath = asset("logo_nobg.png");
  const LOGO_W = GEOM.logoW;
  const LOGO_H = Math.round(LOGO_W * 1.0);

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, leftX, topY + 6, { width: LOGO_W, height: LOGO_H });
  }
  doc
    .fillColor(PALETTE.white)
    .font("Helvetica-Bold")
    .fontSize(TYPE.header)
    .text("docuProof.io", leftX + LOGO_W + 12, topY + 9, { continued: true });
  doc.fillColor(PALETTE.white).text("  —  ");
  doc.fillColor(PALETTE.white).text(text);
}

function makeRowRenderer(doc, bounds) {
  const { labelX, valueX, right, startY } = bounds;
  let y = startY;

  const lineWidth = right - valueX; // where values + help wrap

  function row(label, value, help) {
    // label
    doc
      .font("Helvetica-Bold")
      .fontSize(TYPE.label)
      .fillColor(PALETTE.green)
      .text(label, labelX, y, { lineBreak: false });

    // value (measured with wrapped width)
    const valueY = y;
    doc
      .font("Helvetica")
      .fontSize(TYPE.value)
      .fillColor(PALETTE.white)
      .text(value, valueX, valueY, { width: lineWidth });

    const afterValueY = doc.y;

    // optional helper
    let afterHelpY = afterValueY;
    if (help) {
      doc
        .font("Helvetica")
        .fontSize(TYPE.help)
        .fillColor(PALETTE.gray)
        .text(help, valueX, afterValueY + 2, { width: lineWidth });
      afterHelpY = doc.y;
    }

    // divider line at bottom of the tallest block
    const blockBottom = Math.max(afterValueY, afterHelpY);
    doc
      .moveTo(labelX, blockBottom + 6)
      .lineTo(right, blockBottom + 6)
      .lineWidth(1)
      .strokeColor(PALETTE.line)
      .stroke();

    y = blockBottom + GEOM.rowPad;
  }

  function currentY() {
    return y;
  }

  return { row, currentY };
}

async function renderPdf(params) {
  const {
    id = "proof",
    filename = "Launch-Test.pdf",
    displayName = "Launch Sync Test",
    verifyUrl = "https://docuproof.io/verify?id=proof",
    quickId = "00000000",
  } = params;

  // Prepare QR (PNG buffer)
  const QR_PNG = await QRCode.toBuffer(verifyUrl, {
    errorCorrectionLevel: "Q",
    margin: 0,
    color: {
      dark: "#000000",
      light: "#99f99900", // fully transparent center; we'll add our own frame
    },
    width: GEOM.qrEdge - GEOM.qrFrame * 2,
  });

  // PDF in memory (binary)
  const doc = new PDFDocument({
    size: [GEOM.pageW, GEOM.pageH],
    margins: { top: 0, left: 0, right: 0, bottom: 0 },
    info: {
      Title: "docuProof Certificate",
      Author: "docuProof.io",
      Producer: "docuProof.io",
    },
  });

  // Fonts (AFM you bundled)
  PDFDocument.prototype.registerFont.call(doc, "Helvetica", fs.readFileSync(afm("Helvetica.afm")));
  PDFDocument.prototype.registerFont.call(doc, "Helvetica-Bold", fs.readFileSync(afm("Helvetica-Bold.afm")));
  PDFDocument.prototype.registerFont.call(doc, "Helvetica-Oblique", fs.readFileSync(afm("Helvetica-Oblique.afm")));
  PDFDocument.prototype.registerFont.call(doc, "Helvetica-BoldOblique", fs.readFileSync(afm("Helvetica-BoldOblique.afm")));

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((res) => doc.on("end", res));

  // Background
  doc.rect(0, 0, GEOM.pageW, GEOM.pageH).fill(PALETTE.bg);

  // Header
  drawHeader(doc, MARGIN, 10, "Proof you can point to.");

  // Card
  const cardX = MARGIN - 4;
  const cardY = GEOM.headerH;
  const cardW = GEOM.pageW - MARGIN * 2 + 8;
  const cardH = GEOM.pageH - GEOM.headerH - MARGIN + 6;
  doc
    .roundedRect(cardX, cardY, cardW, cardH, GEOM.cardR)
    .fillColor(PALETTE.card)
    .fill();

  // Title
  const titleX = MARGIN + 18;
  const titleY = GEOM.headerH + 18;
  doc.font("Helvetica-Bold").fontSize(TYPE.title).fillColor(PALETTE.white);
  doc.text("Proof you can point to.", titleX, titleY);

  // Subtitle / helper line under title
  doc
    .font("Helvetica")
    .fontSize(TYPE.help)
    .fillColor(PALETTE.gray)
    .text(
      "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
      titleX,
      titleY + 28,
      { width: GEOM.pageW - titleX - MARGIN - 18 }
    );

  // Compute columns
  const leftColX = titleX;
  const contentTop = titleY + 64;

  // Place QR at right within the card
  const qrOuter = {
    w: GEOM.qrEdge,
    h: GEOM.qrEdge,
    x: GEOM.pageW - MARGIN - GEOM.qrEdge - 6,
    y: contentTop + 6,
  };

  // QR green frame
  doc
    .rect(qrOuter.x, qrOuter.y, qrOuter.w, qrOuter.h)
    .fillColor(PALETTE.green)
    .fill();

  // QR inner (PNG)
  const qrInnerX = qrOuter.x + GEOM.qrFrame;
  const qrInnerY = qrOuter.y + GEOM.qrFrame;
  const qrInnerEdge = qrOuter.w - GEOM.qrFrame * 2;

  doc.image(QR_PNG, qrInnerX, qrInnerY, { width: qrInnerEdge, height: qrInnerEdge });

  // Rows area right bound is left edge of QR minus gutter
  const rowsRight = qrOuter.x - GEOM.columnGutter;

  // Section header “Proof Summary”
  doc
    .font("Helvetica-Bold")
    .fontSize(TYPE.label + 2)
    .fillColor(PALETTE.green)
    .text("Proof Summary", leftColX, contentTop);

  // Divider under section header
  doc
    .moveTo(leftColX, contentTop + 18)
    .lineTo(rowsRight, contentTop + 18)
    .lineWidth(1)
    .strokeColor(PALETTE.line)
    .stroke();

  const { row } = makeRowRenderer(doc, {
    labelX: leftColX,
    valueX: GEOM.valueColX,
    right: rowsRight,
    startY: contentTop + 26,
  });

  // ---------- Data Rows (with helper text) ----------
  row("Proof ID", id, "Your permanent reference for this proof. Keep it with your records.");
  row("Quick Verify ID", quickId, "10-character code you can paste at docuProof.io/verify for fast lookups.");
  row("Created (UTC)", new Date().toISOString(), "Timestamp when this PDF was generated on the server.");
  row("File Name", filename, "Original filename you submitted for hashing.");
  row("Display Name", displayName, "Human-friendly name that appears on your proof.");
  row(
    "Public Verify URL",
    verifyUrl,
    "Anyone can verify this proof at any time using this URL or the Quick Verify ID above."
  );

  // Footer legal
  doc
    .font("Helvetica")
    .fontSize(7.2)
    .fillColor(PALETTE.gray)
    .text(
      "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
      MARGIN,
      GEOM.pageH - MARGIN - 10,
      { width: GEOM.pageW - MARGIN * 2 }
    );

  doc.end();
  await done;
  const pdfBuffer = Buffer.concat(chunks);
  return pdfBuffer;
}

// ---------- Netlify handler ----------
exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const buf = await renderPdf({
      id: q.id,
      filename: q.filename,
      displayName: q.displayName,
      verifyUrl: q.verifyUrl,
      quickId: q.quickId,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${(q.filename || "proof").replace(/"/g, "")}"`,
        "Cache-Control": "no-store,no-cache,must-revalidate",
      },
      body: buf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "PDF build failed",
        detail: String(err && err.message ? err.message : err),
      }),
    };
  }
};