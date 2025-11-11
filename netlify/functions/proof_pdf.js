// netlify/functions/proof_pdf.js
// v6.0 (landscape layout to match reference screenshot + helper text)

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const BRAND = {
  green: "#16FF70",
  bg: "#0b0d0f",
  card: "#0b0d0f",
  text: "#E6E7EB",
  mut: "#9aa3ad",
  rule: "#1f2630",
};

const readParam = (q, k, d = "") => {
  const v = (q || {})[k];
  return typeof v === "string" && v.trim() ? v.trim() : d;
};

const pick = (...p) => p.find((x) => x && fs.existsSync(x)) || null;

const headers = (filename) => ({
  "Content-Type": "application/pdf",
  "Content-Disposition": `inline; filename="${filename || "Proof.pdf"}"`,
  "Cache-Control": "no-cache,no-store,must-revalidate",
});

const pdfToBase64 = (doc) =>
  new Promise((resolve, reject) => {
    const bufs = [];
    doc.on("data", (c) => bufs.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(bufs).toString("base64")));
    doc.end();
  });

async function makeQR(url, px) {
  // Brand-green background, black modules (like your mock)
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: px,
    type: "png",
    color: {
      dark: "#000000",
      light: "#16FF70FF", // brand green background
    },
  });
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const proofId = readParam(q, "id", "unknown");
    const filename = readParam(q, "filename", "Launch-Test.pdf");
    const displayName = readParam(q, "displayName", "Launch Sync Test");
    const verifyUrl = readParam(
      q,
      "verifyUrl",
      `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`
    );
    const quickId = readParam(q, "quickId", "").slice(0, 10);

    // asset lookup
    const assetsDir = path.join(__dirname, "assets");
    const logoPath = pick(
      path.join(assetsDir, "logo_nobg.png"),
      path.join(assetsDir, "logo.png")
    );

    // Letter landscape (matches your screenshot proportions well)
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "landscape",
      margin: 0,
      pdfVersion: "1.3",
      autoFirstPage: false,
    });

    // dimensions (points)
    // Letter landscape: 11in x 8.5in = 792 x 612 pt
    const W = 792;
    const H = 612;
    const M = 28; // outer margin

    // typography scale (compact)
    const F_brand = 20;
    const F_h1 = 34;
    const F_sub = 12.5;
    const F_label = 13.5;
    const F_val = 14.5;
    const F_helper = 11;

    // columns (left info / right visuals)
    const colGap = 24;
    const rightW = 290; // space for logo+QR
    const leftW = W - (M * 2 + colGap + rightW);

    // start page
    doc.addPage();

    // full-bleed background
    doc.save().rect(0, 0, W, H).fill(BRAND.bg).restore();

    // top brand line
    const brandX = M;
    const brandY = M;
    doc
      .fillColor(BRAND.green)
      .font("Helvetica-Bold")
      .fontSize(F_brand)
      .text("docuProof.io — Proof you can point to.", brandX, brandY);

    // divider
    const divY = brandY + F_brand + 10;
    doc
      .save()
      .moveTo(M, divY)
      .lineTo(W - M, divY)
      .lineWidth(1)
      .strokeColor(BRAND.rule)
      .stroke()
      .restore();

    // content baseline
    const contentTop = divY + 20;

    // LEFT COLUMN
    let x = M;
    let y = contentTop;

    // H1 + subtitle
    doc.fillColor(BRAND.text).font("Helvetica-Bold").fontSize(F_h1);
    doc.text("Proof you can point to.", x, y);
    y += F_h1 + 6;

    doc.fillColor(BRAND.mut).font("Helvetica").fontSize(F_sub);
    doc.text(
      "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
      x,
      y,
      { width: leftW }
    );
    y += 28;

    // Section header
    doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(F_val);
    doc.text("Proof Summary", x, y);
    y += 12;

    // field helper
    const rule = () => {
      doc
        .save()
        .moveTo(x, y + 6)
        .lineTo(x + leftW, y + 6)
        .lineWidth(0.6)
        .strokeColor(BRAND.rule)
        .stroke()
        .restore();
      y += 14;
    };
    const field = (label, value) => {
      doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(F_label);
      doc.text(label, x, y, { continued: true });
      doc.fillColor(BRAND.text).font("Helvetica").fontSize(F_val);
      doc.text(`  ${value}`);
      rule();
    };

    field("Proof ID", proofId);
    field("Quick Verify ID", quickId || "—");
    field("Created (UTC)", new Date().toISOString());
    field("File Name", filename);
    field("Display Name", displayName);

    // Public URL + helper text
    doc.fillColor(BRAND.green).font("Helvetica-Bold").fontSize(F_label);
    doc.text("Public Verify URL", x, y);
    y += 16;

    doc
      .fillColor("#6ECF97")
      .font("Helvetica")
      .fontSize(F_val)
      .text(verifyUrl, x, y, { width: leftW, link: verifyUrl });
    y = doc.y + 6;

    doc
      .fillColor(BRAND.mut)
      .font("Helvetica")
      .fontSize(F_helper)
      .text(
        "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.",
        x,
        y,
        { width: leftW }
      );

    // RIGHT COLUMN
    const rx = M + leftW + colGap;
    const ry = contentTop;

    // logo (top-right)
    if (logoPath) {
      try {
        doc.image(logoPath, rx + rightW - 210, ry - 8, { width: 210 });
      } catch {}
    }

    // QR (bottom-right)
    const qrSize = 300; // visual size in px for PNG; drawn narrower to add margins
    const qrPad = 18;
    const qrBox = rightW; // available width
    const qrDraw = qrBox - qrPad * 2; // draw size

    const qrUrl = verifyUrl; // encode full verify URL
    let qrBuf = null;
    try {
      qrBuf = await makeQR(qrUrl, qrSize);
    } catch {}

    const qrY = H - M - (qrDraw + qrPad * 2);
    // draw brand-green tile to match screenshot
    doc
      .save()
      .rect(rx, qrY, qrBox, qrDraw + qrPad * 2)
      .fill(BRAND.green)
      .restore();

    if (qrBuf) {
      doc.image(qrBuf, rx + qrPad, qrY + qrPad, { width: qrDraw, height: qrDraw });
    }

    // finalize
    const b64 = await pdfToBase64(doc);
    return {
      statusCode: 200,
      headers: {
        ...headers(filename),
        "x-docuproof-version": "proof_pdf v6.0 (landscape, helper, brand QR)",
      },
      body: b64,
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "PDF build failed",
        detail: err && (err.message || String(err)),
      }),
    };
  }
};