// netlify/functions/proof_pdf.js
// v5.3 — single-page layout, smaller type, crisp QR (transparent bg), logo alpha
// Runtime: Node 18 (Netlify), CommonJS

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

// ---------- helpers ----------
function param(obj, key, dflt = "") {
  const v = obj[key];
  return (typeof v === "string" && v.trim() !== "") ? v.trim() : dflt;
}

function pickExisting(...candidates) {
  for (const p of candidates) if (p && fs.existsSync(p)) return p;
  return null;
}

function inlineHeaders(filename, extra = {}) {
  return {
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${filename || "docuProof.pdf"}"`,
    "Cache-Control": "no-cache,no-store,must-revalidate",
    ...extra,
  };
}

function endPDFToBase64(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks).toString("base64")));
    doc.end();
  });
}

// ---------- qr as PNG buffer (crisp, dark, transparent bg) ----------
async function qrPngBuffer(text, sizePx) {
  return await QRCode.toBuffer(text, {
    errorCorrectionLevel: "M",
    margin: 0,
    width: sizePx, // raster size; PDFKit will rescale without blur
    color: { dark: "#000000", light: "#00000000" }, // transparent light
    type: "png",
  });
}

// ---------- Netlify function handler ----------
exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};

    // inputs
    const proofId     = param(q, "id", "unknown");
    const filename    = param(q, "filename", "Proof.pdf");
    const displayName = param(q, "displayName", "");
    const verifyUrl   = param(q, "verifyUrl", `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`);
    const quickId     = param(q, "quickId", "").slice(0, 10);

    // assets (prefer transparent logo)
    const assetsRoot = path.join(__dirname, "assets");
    const logoPath = pickExisting(
      path.join(assetsRoot, "logo_nobg.png"),
      path.join(assetsRoot, "logo.png")
    );

    // PDF page + layout constants
    // A4 (595 x 842 pt) — keep consistent with your theme
    const MARGIN = 54;                 // page margin
    const PAGE_W = 595.28, PAGE_H = 841.89;
    const COL_GAP = 24;

    // Typography scale (smaller than earlier builds)
    const H1  = 24;    // title
    const H2  = 14;    // section header
    const LBL = 10;    // label
    const TXT = 11;    // body text
    const META= 9;     // footer

    // QR/logo sizes
    const QR_WIDTH_PT = 150;      // ~2.1" — crisp, dark
    const LOGO_WIDTH_PT = 170;    // visual balance on the right column

    const nowISO = new Date().toISOString();

    // Create doc
    const doc = new PDFDocument({
      autoFirstPage: false,
      size: [PAGE_W, PAGE_H],
      margin: MARGIN,
      pdfVersion: "1.3"
    });

    doc.addPage();
    doc.fillColor("#E6E7EB"); // light gray text color
    doc.font("Helvetica");    // uses AFM family you bundled

    // Canvas boxes
    const innerW = PAGE_W - 2*MARGIN;
    const y0 = MARGIN;
    const sectionPad = 16;

    // Card background
    doc.save()
       .roundedRect(MARGIN, MARGIN, innerW, PAGE_H - 2*MARGIN, 8)
       .fillAndStroke("#111519", "#1a1f24")
       .restore();

    // Inset for content
    const insetX = MARGIN + 20;
    let y = MARGIN + 26;

    // Title row
    doc.fillColor("#E6E7EB")
       .font("Helvetica-Bold")
       .fontSize(H1)
       .text("Proof you can point to.", insetX, y);

    y += 34;

    // Right column: logo (if present)
    const rightColX = MARGIN + innerW - LOGO_WIDTH_PT - 26;
    if (logoPath) {
      try {
        doc.image(logoPath, rightColX, y - 10, { width: LOGO_WIDTH_PT });
      } catch {}
    }

    // Section header
    doc.fillColor("#16FF70")
       .font("Helvetica-Bold")
       .fontSize(H2)
       .text("Proof Summary", insetX, y);
    y += 14 + sectionPad;

    // two-column grid (left: fields, right: QR)
    const leftW  = innerW - LOGO_WIDTH_PT - 60;
    const label = (t) => {
      doc.fillColor("#6E7681").font("Helvetica-Bold").fontSize(LBL).text(t, { continued: false });
    };
    const line  = (t) => {
      doc.fillColor("#E6E7EB").font("Helvetica").fontSize(TXT).text(t);
    };

    // Fields
    label("Proof ID");          line(proofId);                y = doc.y + 10;
    doc.moveTo(insetX, y).lineTo(insetX+leftW, y).strokeColor("#1f2630").lineWidth(0.6).stroke();

    y += 10; doc.y = y;
    label("Quick Verify ID");  line(quickId || "—");         y = doc.y + 10;
    doc.moveTo(insetX, y).lineTo(insetX+leftW, y).strokeColor("#1f2630").lineWidth(0.6).stroke();

    y += 10; doc.y = y;
    label("Created (UTC)");    line(nowISO);                 y = doc.y + 10;
    doc.moveTo(insetX, y).lineTo(insetX+leftW, y).strokeColor("#1f2630").lineWidth(0.6).stroke();

    y += 10; doc.y = y;
    label("File Name");        line(filename);               y = doc.y + 10;
    doc.moveTo(insetX, y).lineTo(insetX+leftW, y).strokeColor("#1f2630").lineWidth(0.6).stroke();

    y += 10; doc.y = y;
    label("Display Name");     line(displayName || "—");     y = doc.y + 10;
    doc.moveTo(insetX, y).lineTo(insetX+leftW, y).strokeColor("#1f2630").lineWidth(0.6).stroke();

    y += 10; doc.y = y;
    label("Verification");     line("Public Verify URL");    doc.moveDown(0.15);
    doc.fillColor("#6ECF97").font("Helvetica").fontSize(TXT)
       .text(verifyUrl, { link: verifyUrl, underline: false, width: leftW });
    y = doc.y + 8;

    // QR code on the right
    try {
      const qrBuf = await qrPngBuffer(verifyUrl, 900); // high source res, scales crisply
      const qrX = MARGIN + innerW - QR_WIDTH_PT - 26;
      const qrY = y - 120; // align visually with last field area
      doc.image(qrBuf, qrX, Math.max(qrY, MARGIN + 140), { width: QR_WIDTH_PT });
    } catch {}

    // Footer
    const footY = PAGE_H - MARGIN - 24;
    doc.fillColor("#9aa3ad").font("Helvetica").fontSize(META);
    doc.text(
      "docuProof batches proofs to Bitcoin for tamper-evident timestamping. " +
      "docuProof is not a notary and does not provide legal attestation.",
      MARGIN, footY, { width: innerW, align: "left" }
    );
    doc.text("© 2025 docuProof.io — All rights reserved.", MARGIN, footY + 12, {
      width: innerW, align: "left",
    });

    // finalize
    const bodyB64 = await endPDFToBase64(doc);

    return {
      statusCode: 200,
      headers: inlineHeaders(filename, {
        "x-docuproof-version": "proof_pdf v5.3",
        "x-docuproof-logo": logoPath ? "1" : "0",
        "x-docuproof-qr": "1",
      }),
      body: bodyB64,
      isBase64Encoded: true,
    };
  } catch (err) {
    const msg = (err && (err.message || err.toString())) || "PDF build failed";
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "PDF build failed", detail: msg }),
    };
  }
};