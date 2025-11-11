// netlify/functions/proof_pdf.js
// v5.4 — dark full-bleed bg, compact type, helper copy, crisp QR on white tile

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

// ---- utils ----
const val = (o, k, d = "") => {
  const v = (o || {})[k];
  return typeof v === "string" && v.trim() ? v.trim() : d;
};
const pick = (...cands) => cands.find((p) => p && fs.existsSync(p)) || null;

const headers = (fname) => ({
  "Content-Type": "application/pdf",
  "Content-Disposition": `inline; filename="${fname || "docuProof.pdf"}"`,
  "Cache-Control": "no-cache,no-store,must-revalidate",
});

const toBase64 = (doc) =>
  new Promise((res, rej) => {
    const bufs = [];
    doc.on("data", (c) => bufs.push(c));
    doc.on("error", rej);
    doc.on("end", () => res(Buffer.concat(bufs).toString("base64")));
    doc.end();
  });

// high-contrast QR: black modules on **white** background
async function qrPng(text, px) {
  return QRCode.toBuffer(text, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: px,
    color: { dark: "#000000", light: "#FFFFFFFF" }, // white background
    type: "png",
  });
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const proofId = val(q, "id", "unknown");
    const filename = val(q, "filename", "Proof.pdf");
    const displayName = val(q, "displayName", "—");
    const verifyUrl = val(
      q,
      "verifyUrl",
      `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`
    );
    const quickId = val(q, "quickId", "").slice(0, 10);

    // assets
    const assets = path.join(__dirname, "assets");
    const logo = pick(
      path.join(assets, "logo_nobg.png"),
      path.join(assets, "logo.png")
    );

    // page + layout
    const PAGE_W = 595.28; // A4
    const PAGE_H = 841.89;
    const M = 36; // outer margin

    // type scale (compact)
    const H1 = 26;
    const H2 = 14;
    const LBL = 10;
    const TXT = 11;
    const META = 9;

    // sizes
    const CARD_R = 10;
    const LOGO_W = 160;
    const QR_W = 148; // fits nicely and scans well
    const innerW = PAGE_W - 2 * M;
    const nowISO = new Date().toISOString();

    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margin: 0,
      autoFirstPage: false,
      pdfVersion: "1.3",
    });

    // page
    doc.addPage();

    // full-bleed dark background
    doc.save().rect(0, 0, PAGE_W, PAGE_H).fill("#0b0d0f").restore();

    // inner card
    const cardX = M;
    const cardY = M;
    const cardW = innerW;
    const cardH = PAGE_H - 2 * M;

    doc
      .save()
      .roundedRect(cardX, cardY, cardW, cardH, CARD_R)
      .fill("#111519")
      .restore();

    // content insets
    const inset = 22;
    let x = cardX + inset;
    let y = cardY + inset + 6;

    // title
    doc.fillColor("#E6E7EB").font("Helvetica-Bold").fontSize(H1);
    doc.text("Proof you can point to.", x, y);
    y += 34;

    // section header
    doc.fillColor("#16FF70").font("Helvetica-Bold").fontSize(H2);
    doc.text("Proof Summary", x, y);
    y += 10;

    // two columns
    const rightColW = 220;
    const leftColW = cardW - rightColW - inset * 2 - 8; // spacing between
    const leftX = x;
    const rightX = cardX + cardW - inset - rightColW;

    // left column fields
    const rule = (yy) => {
      doc
        .save()
        .moveTo(leftX, yy)
        .lineTo(leftX + leftColW, yy)
        .lineWidth(0.6)
        .strokeColor("#1f2630")
        .stroke()
        .restore();
    };
    const field = (label, value) => {
      doc.fillColor("#6E7681").font("Helvetica-Bold").fontSize(LBL).text(label, leftX, y, {
        width: leftColW,
      });
      y += 12;
      doc.fillColor("#E6E7EB").font("Helvetica").fontSize(TXT).text(value, leftX, y, {
        width: leftColW,
      });
      y = doc.y + 8;
      rule(y);
      y += 8;
    };

    field("Proof ID", proofId);
    field("Quick Verify ID", quickId || "—");
    field("Created (UTC)", nowISO);
    field("File Name", filename);
    field("Display Name", displayName);

    // Verification block
    doc.fillColor("#6E7681").font("Helvetica-Bold").fontSize(LBL);
    doc.text("Verification", leftX, y, { width: leftColW });
    y += 12;

    doc.fillColor("#E6E7EB").font("Helvetica-Bold").fontSize(LBL);
    doc.text("Public Verify URL", leftX, y);
    y += 12;

    doc
      .fillColor("#6ECF97")
      .font("Helvetica")
      .fontSize(TXT)
      .text(verifyUrl, leftX, y, {
        width: leftColW,
        link: verifyUrl,
        underline: false,
      });
    y = doc.y + 6;

    // helper sentence (restored)
    doc
      .fillColor("#9aa3ad")
      .font("Helvetica")
      .fontSize(META)
      .text(
        "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.",
        leftX,
        y,
        { width: leftColW }
      );

    // right column: logo + QR (QR on white tile for contrast)
    // logo
    const logoY = cardY + inset + 10;
    if (logo) {
      try {
        doc.image(logo, rightX + rightColW - LOGO_W, logoY, { width: LOGO_W });
      } catch {}
    }

    // QR white tile
    const qrTileW = QR_W + 16;
    const qrTileX = rightX + (rightColW - qrTileW) / 2;
    const qrTileY = logoY + LOGO_W * 0.55; // below logo
    doc
      .save()
      .roundedRect(qrTileX, qrTileY, qrTileW, qrTileW, 8)
      .fill("#ffffff")
      .restore();

    try {
      const qrBuf = await qrPng(verifyUrl, 900);
      doc.image(qrBuf, qrTileX + 8, qrTileY + 8, { width: QR_W });
    } catch {}

    // footer
    const footY = cardY + cardH - inset - 22;
    doc.fillColor("#9aa3ad").font("Helvetica").fontSize(META);
    doc.text(
      "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
      cardX + inset,
      footY,
      { width: cardW - inset * 2 }
    );
    doc.text("© 2025 docuProof.io — All rights reserved.", cardX + inset, footY + 12);

    // finalize
    const b64 = await toBase64(doc);
    return {
      statusCode: 200,
      headers: {
        ...headers(filename),
        "x-docuproof-version": "proof_pdf v5.4",
      },
      body: b64,
      isBase64Encoded: true,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "PDF build failed",
        detail: e && (e.message || String(e)),
      }),
    };
  }
};