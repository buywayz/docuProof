// netlify/functions/proof_pdf.js
// Drop-in replacement — keeps current features, only adjusts typography/spacing.
// Runtime: Node 18 / Netlify Functions (bundled with esbuild)

const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

// ---------- Tunables (only changes vs prior build are the font sizes + VALUE_X) ----------
const COLORS = {
  bg: "#0b0d0f",
  panel: "#111418",
  divider: "#1a1f24",
  text: "#E6E7EB",
  soft: "#98A2AD",
  green: "#16FF70",
  qrBg: "#9BFFA9",
  qrFg: "#000000",
};

const PAGE = {
  size: "LETTER",      // 612 x 792 (portrait); we use landscape below
  layout: "landscape",
  margin: 28,
  radius: 14,
};

const TITLE_SZ = 15.0;   // overall headline
const LABEL_SZ = 7.8;    // green labels
const VALUE_SZ = 7.8;    // white values
const HELP_SZ  = 7.0;    // gray helper text

const COLS = {
  LABEL_X: 36,
  VALUE_X: 184,  // move right to widen label gutter
  TOP_Y:   120,
  ROW_PAD: 12,   // more/less vertical space per row
  QR_EDGE: 210,  // QR side length
  QR_PAD:  16,
};

// ----------------------------------------------------------------------------------------

/** Resolve a file inside the functions bundle (works in Netlify’s /var/task tree). */
function resolveIn(fnDir, rel) {
  return path.resolve(fnDir, rel);
}

/** Try to register Helvetica family from bundled AFM files; otherwise fallback. */
function registerHelvetica(doc, fnDir) {
  try {
    const dataDir = resolveIn(fnDir, "data");
    const haveAll =
      fs.existsSync(path.join(dataDir, "Helvetica.afm")) &&
      fs.existsSync(path.join(dataDir, "Helvetica-Bold.afm")) &&
      fs.existsSync(path.join(dataDir, "Helvetica-Oblique.afm")) &&
      fs.existsSync(path.join(dataDir, "Helvetica-BoldOblique.afm"));

    if (haveAll) {
      doc.registerFont("Helvetica",          path.join(dataDir, "Helvetica.afm"));
      doc.registerFont("Helvetica-Bold",     path.join(dataDir, "Helvetica-Bold.afm"));
      doc.registerFont("Helvetica-Oblique",  path.join(dataDir, "Helvetica-Oblique.afm"));
      doc.registerFont("Helvetica-BoldOblique", path.join(dataDir, "Helvetica-BoldOblique.afm"));
      return { ok: true, via: "afm" };
    }
  } catch (_) { /* fall through */ }
  // PDFKit has built-ins; don’t register if AFMs missing.
  return { ok: true, via: "builtin" };
}

/** Draw the small brand mark + heading on top */
function drawHeader(doc, fnDir, panel) {
  const logoPaths = [
    resolveIn(fnDir, "assets/logo_nobg.png"),
    resolveIn(fnDir, "assets/logo.png"),
  ];
  let logo = null;
  for (const p of logoPaths) { if (fs.existsSync(p)) { logo = p; break; } }

  const y = panel.y - 46;
  const x = panel.x + 6;

  if (logo) {
    try {
      doc.image(logo, x, y - 2, { width: 26, height: 26 });
    } catch (_) { /* ignore draw-time errors */ }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(COLORS.green)
    .text("docuProof.io", x + 34, y);

  doc
    .font("Helvetica-Bold")
    .fillColor(COLORS.text)
    .text(" — Proof you can point to.", x + 34 + doc.widthOfString("docuProof.io "), y);
}

/** Horizontal divider line */
function divider(doc, x1, x2, y) {
  doc
    .moveTo(x1, y)
    .lineTo(x2, y)
    .lineWidth(1)
    .strokeColor(COLORS.divider)
    .stroke();
}

/** A single metadata row with label / value / helper. Returns next y. */
function row(doc, y, label, value, help, panelXRight) {
  doc.font("Helvetica-Bold").fontSize(LABEL_SZ).fillColor(COLORS.green).text(label, COLS.LABEL_X, y);
  const lineY = y + LABEL_SZ + 8;
  divider(doc, COLS.LABEL_X, panelXRight, lineY);

  doc.font("Helvetica-Bold").fontSize(VALUE_SZ).fillColor(COLORS.text).text(value, COLS.VALUE_X, y);
  if (help) {
    doc.font("Helvetica").fontSize(HELP_SZ).fillColor(COLORS.soft).text(help, COLS.VALUE_X, y + LABEL_SZ + 10);
  }
  return y + COLS.ROW_H;
}

/** Generate a QR PNG buffer (transparent) */
async function makeQrPng(data) {
  return await QRCode.toBuffer(data, {
    errorCorrectionLevel: "H",
    margin: 0,
    color: { dark: COLORS.qrFg, light: "#00000000" },
    scale: 8,
    type: "png",
  });
}

/** Render the QR with a soft green frame */
function drawQr(doc, pngBuf, x, y) {
  const edge = COLS.QR_EDGE;
  const pad = COLS.QR_PAD;

  // frame
  doc.save()
     .roundedRect(x - pad, y - pad, edge + 2 * pad, edge + 2 * pad, 8)
     .fillColor(COLORS.qrBg)
     .fill()
     .restore();

  try {
    doc.image(pngBuf, x, y, { width: edge, height: edge });
  } catch (_) { /* ignore */ }
}

exports.handler = async (event) => {
  const fnDir = __dirname; // …/netlify/functions

  // --- Parse inputs ---
  const qp = event.queryStringParameters || {};
  const proofId   = (qp.id || "unknown").toString();
  const fileName  = (qp.filename || "document").toString();
  const display   = (qp.displayName || "Proof").toString();
  const verifyUrl = (qp.verifyUrl || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`).toString();
  const quickId   = (qp.quickId || Math.random().toString(36).slice(2, 10)).toString();

  // Build a PDF in memory
  const doc = new PDFDocument({
    size: PAGE.size,
    layout: PAGE.layout,
    margin: PAGE.margin,
    bufferPages: true,
  });

  // Make background
  const pageW = doc.page.width, pageH = doc.page.height;
  doc.rect(0, 0, pageW, pageH).fillColor(COLORS.bg).fill();

  // Fonts
  registerHelvetica(doc, fnDir);

  // Panel
  const panel = {
    x: PAGE.margin + 12,
    y: PAGE.margin + 60,
    w: pageW - (PAGE.margin + 12) * 2,
    h: pageH - (PAGE.margin + 60) - PAGE.margin,
  };
  doc
    .save()
    .roundedRect(panel.x, panel.y, panel.w, panel.h, PAGE.radius)
    .fillColor(COLORS.panel)
    .fill()
    .restore();

  // Header line + title
  drawHeader(doc, fnDir, panel);
  doc
    .font("Helvetica-Bold")
    .fontSize(TITLE_SZ)
    .fillColor(COLORS.text)
    .text("Proof you can point to.", panel.x + 26, panel.y + 18);

  // Subtitle/intro
  doc
    .font("Helvetica")
    .fontSize(HELP_SZ + 0.4)
    .fillColor(COLORS.soft)
    .text(
      "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
      panel.x + 26,
      panel.y + 48,
      { width: panel.w - 52 }
    );

  // Left column origin
  let y = COLS.COL_Y;
  const panelRight = panel.x + panel.w - 26;

  // Section title
  doc.font("Helvetica-Bold").fontSize(TITLE_SZ).fillColor(COLORS.text).text("Proof Summary", panel.x + 26, y - 28);
  divider(doc, panel.x + 26, panelRight, y - 6);

  // Rows
  y = row(
    doc, y,
    "Proof ID", proofId,
    "Your permanent reference for this proof. Keep it with your records.",
    panelRight
  );
  y = row(
    doc, y,
    "Quick Verify ID", quickId,
    "10-character code you can paste at docuProof.io/verify for fast lookups.",
    panelRight
  );
  y = row(
    doc, y,
    "Created (UTC)", new Date().toISOString(),
    "Timestamp when this PDF was generated on the server.",
    panelRight
  );
  y = row(
    doc, y,
    "File Name", fileName,
    "Original filename you submitted for hashing.",
    panelRight
  );
  y = row(
    doc, y,
    "Display Name", display,
    "Human-friendly name that appears on your proof.",
    panelRight
  );
  y = row(
    doc, y,
    "Public Verify URL", verifyUrl,
    "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.",
    panelRight
  );

  // QR on the right column
  const qrX = panelRight - (COLS.QR_EDGE + COLS.QR_PAD); // inside panel
  const qrY = COLS.COL_Y - 6; // align with rows visually
  let qrBuf;
  try { qrBuf = await makeQrPng(verifyUrl); } catch (_) { qrBuf = null; }
  if (qrBuf) drawQr(doc, qrBuf, qrX, qrY);

  // Footer disclaimer
  const foot = "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.";
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.soft)
    .text(foot, panel.x + 10, panel.y + panel.h - 22, { width: panel.w - 20, align: "left" });

  // Collect as buffer
  const chunks = [];
  const resultP = new Promise((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.end();

  let bodyBuf;
  try { bodyBuf = await resultP; } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache",
        "x-docuproof-version": "proof_pdf v6.1.0 (exception)",
      },
      body: JSON.stringify({ ok: false, error: "PDF build failed", detail: String(err && err.message || err) }),
    };
  }

  // Response
  const headers = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${(qp.filename || "proof")}.pdf"`,
    "Cache-Control": "no-cache,no-store,must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "x-docuproof-version": "proof_pdf v6.1.0",
  };

  // (Debug hints to help you verify assets were found; harmless if ignored by clients)
  try {
    headers["x-docuproof-logo-src"] = fs.existsSync(resolveIn(fnDir, "assets/logo_nobg.png")) ? "logo_nobg.png" :
                                      (fs.existsSync(resolveIn(fnDir, "assets/logo.png")) ? "logo.png" : "none");
    headers["x-docuproof-qr"] = qrBuf ? "1" : "0";
  } catch (_) { /* ignore */ }

  return {
    statusCode: 200,
    headers,
    isBase64Encoded: true,
    body: bodyBuf.toString("base64"),
  };
};