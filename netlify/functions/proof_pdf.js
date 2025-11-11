// netlify/functions/proof_pdf.js
// v6.1 — compact landscape layout, logo left of brand line, helper text per field

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const BRAND = {
  green: "#16FF70",
  bg: "#0b0d0f",
  text: "#E6E7EB",
  mut: "#9aa3ad",
  rule: "#1f2630",
};

const param = (q, k, d = "") => {
  const v = (q || {})[k];
  return typeof v === "string" && v.trim() ? v.trim() : d;
};

const pick = (...p) => p.find((x) => x && fs.existsSync(x)) || null;

const headers = (filename) => ({
  "Content-Type": "application/pdf",
  "Content-Disposition": `inline; filename="${filename || "Proof.pdf"}"`,
  "Cache-Control": "no-cache,no-store,must-revalidate",
});

const streamToB64 = (doc) =>
  new Promise((res, rej) => {
    const bufs = [];
    doc.on("data", (c) => bufs.push(c));
    doc.on("error", rej);
    doc.on("end", () => res(Buffer.concat(bufs).toString("base64")));
    doc.end();
  });

async function makeQR(url, px) {
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: px,
    type: "png",
    color: {
      dark: "#000000",     // black modules
      light: "#16FF70FF",  // brand green background tile
    },
  });
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const proofId     = param(q, "id", "unknown");
    const filename    = param(q, "filename", "Launch-Test.pdf");
    const displayName = param(q, "displayName", "Launch Sync Test");
    const verifyUrl   = param(q, "verifyUrl", `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`);
    const quickId     = param(q, "quickId", "").slice(0, 10);

    // assets
    const assetsDir = path.join(__dirname, "assets");
    const logoPath  = pick(path.join(assetsDir, "logo_nobg.png"), path.join(assetsDir, "logo.png"));

    // page (Letter landscape, 792×612pt)
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "landscape",
      margin: 0,
      pdfVersion: "1.3",
      autoFirstPage: false,
    });

    const W = 792, H = 612;
    const M = 26;             // outer margin
    const topPad = 10;

    // compact type scale
    const FS = {
      brand: 18,
      h1: 30,
      sub: 12,
      label: 12,
      val: 13,
      help: 10.5,
    };

    // columns
    const rightW = 270;       // right visual column
    const gap = 22;
    const leftW = W - (M * 2 + gap + rightW);

    // page & background
    doc.addPage();
    doc.save().rect(0, 0, W, H).fill(BRAND.bg).restore();

    // BRAND ROW (logo left + title)
    const brandY = M + topPad;
    let brandX = M;

    const logoW = 42; // small logo to the left of brand line
    if (logoPath) {
      try { doc.image(logoPath, brandX, brandY - 6, { width: logoW }); } catch {}
      brandX += logoW + 10;
    }

    doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(FS.brand)
       .text("docuProof.io — Proof you can point to.", brandX, brandY);

    // divider
    const divY = brandY + FS.brand + 10;
    doc.save().moveTo(M, divY).lineTo(W - M, divY).lineWidth(1).strokeColor(BRAND.rule).stroke().restore();

    // content origin
    const originY = divY + 18;

    // LEFT COLUMN
    let x = M, y = originY;

    // H1 + subtitle
    doc.fillColor(BRAND.text).font("Helvetica-Bold").fontSize(FS.h1)
       .text("Proof you can point to.", x, y, { width: leftW });
    y += FS.h1 + 6;

    doc.fillColor(BRAND.mut).font("Helvetica").fontSize(FS.sub)
       .text(
         "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
         x, y, { width: leftW }
       );
    y = doc.y + 10;

    // section title
    doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(FS.val).text("Proof Summary", x, y);
    y += 6;
    const rule = () => {
      doc.save().moveTo(x, y + 6).lineTo(x + leftW, y + 6).lineWidth(0.6).strokeColor(BRAND.rule).stroke().restore();
      y += 12;
    };
    const field = (label, value, helpLine) => {
      doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(FS.label).text(label, x, y, { continued: true });
      doc.fillColor(BRAND.text).font("Helvetica").fontSize(FS.val).text(`  ${value}`);
      if (helpLine) {
        doc.fillColor(BRAND.mut).font("Helvetica").fontSize(FS.help).text(helpLine, x, y + 10, { width: leftW });
        y = doc.y;
      }
      rule();
    };

    field("Proof ID", proofId, "Your permanent reference for this proof. Keep it with your records.");
    field("Quick Verify ID", quickId || "—", "10-character code you can paste at docuProof.io/verify for fast lookups.");
    field("Created (UTC)", new Date().toISOString(), "Timestamp when this PDF was generated on the server.");
    field("File Name", filename, "Original filename you submitted for hashing.");
    field("Display Name", displayName, "Human-friendly name that appears on your proof.");

    // Public URL + helper line
    doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(FS.label).text("Public Verify URL", x, y);
    y += 14;
    doc.fillColor("#6ECF97").font("Helvetica").fontSize(FS.val).text(verifyUrl, x, y, { width: leftW, link: verifyUrl });
    y = doc.y + 6;
    doc.fillColor(BRAND.mut).font("Helvetica").fontSize(FS.help)
       .text("Anyone can verify this proof at any time using this URL or the Quick Verify ID above.", x, y, { width: leftW });

    // RIGHT COLUMN (logo above QR, smaller)
    const rx = M + leftW + gap;
    const ry = originY;

    if (logoPath) {
      try { doc.image(logoPath, rx + rightW - 180, ry - 6, { width: 180 }); } catch {}
    }

    // QR (smaller & higher contrast)
    const qrTile = 248;  // visual tile width
    const qrPad  = 16;
    const qrDraw = qrTile - qrPad * 2;
    const qrY = H - M - qrTile;

    let qrBuf = null;
    try { qrBuf = await makeQR(verifyUrl, 280); } catch {}

    // green tile
    doc.save().rect(rx + rightW - qrTile, qrY, qrTile, qrTile).fill(BRAND.green).restore();
    if (qrBuf) {
      doc.image(qrBuf, rx + rightW - qrTile + qrPad, qrY + qrPad, { width: qrDraw, height: qrDraw });
    }

    // finalize
    const b64 = await streamToB64(doc);
    return {
      statusCode: 200,
      headers: {
        ...headers(filename),
        "x-docuproof-version": "proof_pdf v6.1 compact-landscape",
      },
      body: b64,
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "PDF build failed", detail: err && (err.message || String(err)) }),
    };
  }
};