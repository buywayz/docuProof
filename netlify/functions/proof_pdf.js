// netlify/functions/proof_pdf.js
// v5.2.3 — add helper sublines under each field (no layout changes otherwise)

const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// ---------- THEME (unchanged from your working look) ----------
const C = {
  bg:        "#0b0d0f",
  panel:     "#111417",
  ink:       "#E6E7EB",
  faint:     "#B7BBC2",
  divider:   "#1a1f24",
  accent:    "#16FF70",
  qrLight:   "#94f7b4",      // frame (same as your working)
  qrDark:    "#000000",
};

// header/logo metrics kept the same visual weight you liked
const M = {
  pageMargins: { l: 40, t: 36, r: 40, b: 36 },
  headerY: 44,
  titleTop: 110,             // “Proof you can point to.”
  colGap: 28,
  rowGap: 14,                // vertical gap between rows
  rowPad:  6,                // pad above helper line
  labelSize: 14,             // “Proof ID”
  valueSize: 18,             // “qr_fix01”
  helpSize: 10,              // helper subline size (NEW)
  titleSize: 40,             // big page title
  summarySize: 22,           // “Proof Summary”
  leftColWidth: 520,
  qrBox: { w: 290, frame: 22 }, // same visual QR block you approved
};

// ---------- tiny helpers ----------
function pJoin(...seg) {
  return path.join(__dirname, ...seg);
}
function tryRead(...seg) {
  const full = pJoin(...seg);
  try { fs.accessSync(full, fs.constants.R_OK); return full; } catch { return null; }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // -------- params (same names you’ve been using) --------
    const q = event.queryStringParameters || {};
    const body = event.body && event.headers["content-type"]?.includes("application/json")
      ? JSON.parse(event.body) : {};

    const get = (k, d="") => (q[k] ?? body[k] ?? d);

    const proofId     = get("id",            "qr_fix01");
    const quickId     = get("quickId",       "00000000");
    const fileName    = get("filename",      "Launch-Test.pdf");
    const displayName = get("displayName",   "Launch Sync Test");
    const verifyUrl   = get("verifyUrl",     `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`);

    // -------- PDF init (landscape letter like your output) --------
    const doc = new PDFDocument({
      size: "LETTER",
      layout: "landscape",
      margins: { left: M.pageMargins.l, right: M.pageMargins.r, top: M.pageMargins.t, bottom: M.pageMargins.b }
    });

    // buffer the stream for Netlify response
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const endPromise = new Promise((res) => doc.on("end", res));

    // -------- background panel --------
    const {width: W, height: H} = doc.page;
    doc.rect(0,0,W,H).fill(C.bg);
    doc.fillColor(C.panel).roundedRect(M.pageMargins.l, 84, W - M.pageMargins.l - M.pageMargins.r, H - 140, 16).fill();

    // -------- header: logo (left) + strapline (unchanged layout) --------
    const logoPath =
      tryRead("assets", "logo_nobg.png") ||
      tryRead("assets", "logo.png")      ||
      tryRead("netlify","functions","assets","logo_nobg.png") ||
      tryRead("netlify","functions","assets","logo.png");

    const headerLeftX = M.pageMargins.l;
    const strapY = M.headerY;

    if (logoPath) {
      // small header mark at left
      const markSize = 28;
      doc.image(logoPath, headerLeftX, strapY - markSize + 6, { width: markSize, height: markSize });
    }

    doc.fillColor(C.accent)
       .font("Helvetica-Bold")
       .fontSize(26)
       .text("docuProof.io", headerLeftX + 38, strapY, { continued: true });

    doc.fillColor(C.ink)
       .font("Helvetica")
       .text(" — Proof you can point to.", undefined, undefined);

    // divider
    doc.moveTo(M.pageMargins.l, strapY + 30)
       .lineTo(W - M.pageMargins.r, strapY + 30)
       .lineWidth(1.2)
       .strokeColor(C.divider)
       .stroke();

    // -------- page title (unchanged style/position) --------
    doc.fillColor(C.ink)
       .font("Helvetica-Bold")
       .fontSize(M.titleSize)
       .text("Proof you can point to.", M.pageMargins.l + 20, M.titleTop);

    // subtitle line
    doc.moveDown(0.2);
    doc.font("Helvetica")
       .fontSize(14)
       .fillColor(C.faint)
       .text("This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.", {
         width: 680
       });

    // -------- layout columns (unchanged) --------
    const leftX = M.pageMargins.l + 20;
    const topY  = M.titleTop + 48;
    const rightX = leftX + M.leftColWidth + M.colGap;

    // section header
    doc.fillColor(C.accent)
       .font("Helvetica-Bold")
       .fontSize(M.summarySize)
       .text("Proof Summary", leftX, topY);

    // horizontal rule under section header (unchanged)
    const ruleY = topY + 26;
    doc.moveTo(leftX, ruleY)
       .lineTo(leftX + M.leftColWidth, ruleY)
       .lineWidth(1)
       .strokeColor(C.divider)
       .stroke();

    // ---------- row helpers (adds subline without changing your spacing baseline) ----------
    let y = ruleY + 16;

    function row(label, value, helper) {
      // Label
      doc.fillColor(C.accent)
         .font("Helvetica-Bold")
         .fontSize(M.labelSize)
         .text(label, leftX, y, { width: 180 });

      // Value
      doc.fillColor(C.ink)
         .font("Helvetica-Bold")
         .fontSize(M.valueSize)
         .text(value, leftX + 190, y, { width: M.leftColWidth - 190 });

      // Divider line
      const lineY = y + 22;
      doc.moveTo(leftX, lineY)
         .lineTo(leftX + M.leftColWidth, lineY)
         .lineWidth(1)
         .strokeColor(C.divider)
         .stroke();

      // Helper (NEW) – small grey subline just under divider, indented to align under value
      if (helper) {
        const helpY = lineY + M.rowPad;
        doc.fillColor(C.faint)
           .font("Helvetica")
           .fontSize(M.helpSize)
           .text(helper, leftX + 190, helpY, {
             width: M.leftColWidth - 190,
             lineBreak: true
           });
        // advance y by helper height + base gap
        const h = doc.heightOfString(helper, { width: M.leftColWidth - 190 });
        y = helpY + h + M.rowGap;
      } else {
        y = lineY + M.rowGap;
      }
    }

    // ---------- left column content (values unchanged), ONLY helper strings added ----------
    row("Proof ID",          proofId,   "Your permanent reference for this proof. Keep it with your records.");
    row("Quick Verify ID",   quickId,   "10-character code you can paste at docuProof.io/verify for fast lookups.");
    row("Created (UTC)",     new Date().toISOString(), "Timestamp when this PDF was generated on the server.");
    row("File Name",         fileName,  "Original filename you submitted for hashing.");
    row("Display Name",      displayName, "Human-friendly name that appears on your proof.");
    row("Public Verify URL", verifyUrl, "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.");

    // ---------- QR code block (unchanged look) ----------
    const qrOuterW = M.qrBox.w + M.qrBox.frame * 2;
    const qrOuterX = rightX;
    const qrOuterY = topY + 6;

    // outer frame
    doc.rect(qrOuterX, qrOuterY, qrOuterW, qrOuterW).fill(C.qrLight);

    // QR render to buffer
    const qrPng = await QRCode.toBuffer(verifyUrl, {
      margin: 0,
      color: { dark: C.qrDark, light: C.qrLight },
      width: M.qrBox.w
    });

    // inner QR
    doc.image(qrPng, qrOuterX + M.qrBox.frame, qrOuterY + M.qrBox.frame, { width: M.qrBox.w });

    // ---------- small footer (unchanged) ----------
    doc.fillColor(C.faint)
       .font("Helvetica")
       .fontSize(9)
       .text("docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.", M.pageMargins.l, H - M.pageMargins.b - 12, { width: W - M.pageMargins.l - M.pageMargins.r });

    // finish
    doc.end();
    await endPromise;

    const pdf = Buffer.concat(chunks);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "no-store,no-cache,must-revalidate",
        "x-docuproof-version": "proof_pdf v5.2.3 helpers-only"
      },
      body: pdf.toString("base64"),
      isBase64Encoded: true
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "x-docuproof-version": "proof_pdf v5.2.3 (exception)" },
      body: JSON.stringify({ ok:false, error:"PDF build failed", detail: err.message, stack: (err.stack||"").split("\n") })
    };
  }
};