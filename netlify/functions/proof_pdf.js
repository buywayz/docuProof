// netlify/functions/proof_pdf.js
// v5.2.3 — revert to “green QR tile” layout, add helper text, keep Acrobat-safe output

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const THEME = {
  bg: "#0b0d0f",
  green: "#16FF70",
  text: "#E6E7EB",
  help: "#97A1AB",
  rule: "#1f2630",
  link: "#6EDFA0",
};

// --- small utils ---
const qget = (q, k, d = "") => {
  const v = (q || {})[k];
  return typeof v === "string" && v.trim() ? v.trim() : d;
};
const pick = (...cands) => cands.find((f) => f && fs.existsSync(f)) || null;
const headers = (fn) => ({
  "Content-Type": "application/pdf",
  "Content-Disposition": `inline; filename="${fn || "Proof.pdf"}"`,
  "Cache-Control": "no-cache,no-store,must-revalidate",
});

// png QR with green tile + black modules (good contrast, easy scanning)
async function makeQR(url, px) {
  return QRCode.toBuffer(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: px,
    type: "png",
    color: { dark: "#000000", light: "#16FF70FF" },
  });
}

function endAsB64(doc) {
  return new Promise((resolve, reject) => {
    const bufs = [];
    doc.on("data", (c) => bufs.push(c));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(bufs).toString("base64")));
    doc.end();
  });
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const proofId     = qget(q, "id", "unknown");
    const filename    = qget(q, "filename", "Launch-Test.pdf");
    const displayName = qget(q, "displayName", "Launch Sync Test");
    const verifyUrl   = qget(q, "verifyUrl", `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`);
    const quickId     = qget(q, "quickId", "").slice(0, 10);

    // assets
    const assetsDir = path.join(__dirname, "assets");
    const logoPath  = pick(path.join(assetsDir, "logo_nobg.png"), path.join(assetsDir, "logo.png"));

    // page: Letter landscape
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "landscape",
      margin: 0,
      pdfVersion: "1.3",
      autoFirstPage: false,
    });

    const W = 792, H = 612;
    const M = 28;                 // outer margin
    const gutter = 26;            // col gap
    const rightW = 300;           // right visual column (logo + QR)
    const leftW  = W - (M * 2 + gutter + rightW);

    // type scale (compact)
    const FS = {
      brand: 18, h1: 32, label: 12.5, val: 13, help: 10.5, smallpad: 8,
    };

    // page bg
    doc.addPage();
    doc.save().rect(0, 0, W, H).fill(THEME.bg).restore();

    // top brand line (left), big logo (right) — this matches the older look
    const brandY = M;
    doc.fillColor(THEME.green).font("Helvetica-Bold").fontSize(FS.brand)
       .text("docuProof.io — Proof you can point to.", M, brandY);

    // divider
    const divY = brandY + FS.brand + 10;
    doc.save().moveTo(M, divY).lineTo(W - M).lineWidth(1).strokeColor(THEME.rule).stroke().restore();

    // left column origin
    let x = M, y = divY + 18;

    // H1
    doc.fillColor(THEME.text).font("Helvetica-Bold").fontSize(FS.h1)
       .text("Proof you can point to.", x, y, { width: leftW });
    y += FS.h1 + 12;

    // summary table, with helper lines under each value
    const rule = () => {
      doc.save().moveTo(x, y + 10).lineTo(x + leftW, y + 10).lineWidth(0.6).strokeColor(THEME.rule).stroke().restore();
      y += 16;
    };

    const field = (label, value, help) => {
      doc.fillColor(THEME.green).font("Helvetica-Bold").fontSize(FS.label).text(label, x, y);
      y += 2;
      doc.fillColor(THEME.text).font("Helvetica").fontSize(FS.val).text(value, x, y);
      y += FS.val + 2;
      if (help) {
        doc.fillColor(THEME.help).font("Helvetica").fontSize(FS.help).text(help, x, y, { width: leftW });
        y = doc.y;
      }
      rule();
    };

    doc.fillColor(THEME.green).font("Helvetica-Bold").fontSize(FS.val).text("Proof Summary", x, y);
    y += FS.smallpad; rule();

    field("Proof ID", proofId, "Permanent reference for this proof. Keep it with your records.");
    field("Quick Verify ID", quickId || "—", "10-character code usable at docuProof.io/verify for fast lookups.");
    field("Created (UTC)", new Date().toISOString(), "Timestamp when this PDF certificate was generated.");
    field("File Name", filename, "Original filename you submitted for hashing.");
    field("Display Name", displayName, "Human-friendly label shown on your proof.");

    // Public URL + helper
    doc.fillColor(THEME.green).font("Helvetica-Bold").fontSize(FS.label).text("Public Verify URL", x, y);
    y += 2;
    doc.fillColor(THEME.link).font("Helvetica").fontSize(FS.val)
       .text(verifyUrl, x, y, { width: leftW, link: verifyUrl });
    y = doc.y + 2;
    doc.fillColor(THEME.help).font("Helvetica").fontSize(FS.help)
       .text("Anyone can verify this proof at any time using this URL or the Quick Verify ID above.", x, y, { width: leftW });

    // right column (logo + big green QR) — same visual as the version you liked
    const rx = M + leftW + gutter;
    const logoW = 200;
    const logoY = divY + 10;
    if (logoPath) {
      try { doc.image(logoPath, rx + rightW - logoW, logoY, { width: logoW }); } catch {}
    }

    // QR tile bottom-right
    const tile = 300, pad = 18, inner = tile - pad * 2;
    const qx = rx + rightW - tile;
    const qy = H - M - tile;

    // green tile
    doc.save().rect(qx, qy, tile, tile).fill(THEME.green).restore();

    // high-contrast QR png placed on top
    let qrBuf = null;
    try { qrBuf = await makeQR(verifyUrl, 320); } catch {}
    if (qrBuf) doc.image(qrBuf, qx + pad, qy + pad, { width: inner, height: inner });

    // finish
    const body = await endAsB64(doc);
    return {
      statusCode: 200,
      headers: {
        ...headers(filename),
        "x-docuproof-version": "proof_pdf v5.2.3 (revert-green-qr + helpers)",
      },
      body,
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "PDF build failed", detail: err?.message || String(err) }),
    };
  }
};