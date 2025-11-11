// netlify/functions/proof_pdf.js
const path = require("path");
const fs   = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

exports.handler = async (event) => {
  try {
    const q = new URLSearchParams(event.queryStringParameters || {});
    const proofId     = (q.get("id") || "qa_"+Date.now()).trim();
    const filename    = (q.get("filename") || "Launch-Test.pdf").trim();
    const displayName = (q.get("displayName") || "Launch Sync Test").trim();
    const verifyUrl   = (q.get("verifyUrl") || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`).trim();
    const quickId     = (q.get("quickId") || Math.random().toString(16).slice(2, 10)).trim();
    const createdUtc  = new Date().toISOString();

    const fnRoot = process.env.LAMBDA_TASK_ROOT || process.cwd();
    const tryPaths = [
      path.join(fnRoot, "netlify/functions/assets/logo_nobg.png"),
      path.join(fnRoot, "netlify/functions/assets/logo.png"),
    ];
    let logoPath = null;
    for (const p of tryPaths) { if (fs.existsSync(p)) { logoPath = p; break; } }

    const qrPng = await QRCode.toBuffer(verifyUrl, {
      type: "png",
      errorCorrectionLevel: "Q",
      margin: 2,
      color: { dark: "#000000", light: "#16FF70" }
    });

    // ---------- Theme & sizing ----------
    const BG        = "#0b0d0f";
    const MAIN      = "#E6E7EB";
    const SOFT      = "#9aa3ab";
    const ACCENT    = "#16FF70";
    const DIVIDER   = "#1a1f24";

    const TITLE_SZ  = 24;
    const LABEL_SZ  = 11;
    const VALUE_SZ  = 11;
    const HELP_SZ   = 9;

    const LABEL_WIDTH = 120; // label column before values
    const VALUE_X     = 136; // start of values (more room than before)

    const QR_BLOCK = 180;    // smaller QR
    const FRAME    = 12;

    // ---------- PDF ----------
    const doc = new PDFDocument({ size: "LETTER", margin: 36, pdfVersion: "1.3" });
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    const done = new Promise(r => doc.on("end", () => r(Buffer.concat(chunks))));

    // Background
    doc.rect(0,0,doc.page.width,doc.page.height).fill(BG);
    doc.fillColor(MAIN);

    // Header
    const leftX = 54, rightX = doc.page.width - 54, headerY = 54;
    let hX = leftX;
    if (logoPath) { doc.image(logoPath, hX, headerY-18, { height: 22 }); hX += 30; } // bigger logo
    doc.font("Helvetica-Bold").fontSize(17).fillColor(ACCENT)
       .text("docuProof.io", hX, headerY-12, { continued:true });
    doc.fillColor(MAIN).text(" — Proof you can point to.", { continued:false });
    doc.moveTo(leftX, headerY+12).lineTo(rightX, headerY+12).strokeColor(DIVIDER).lineWidth(1).stroke();

    // Card container
    const cardX = leftX, cardY = headerY + 28;
    const cardW = doc.page.width - leftX - 54;
    const cardH = 520;
    doc.save().roundedRect(cardX, cardY, cardW, cardH, 10)
       .fillOpacity(0.92).fill("#101417").restore();

    // Title + subtitle
    const pad = 24;
    let y = cardY + pad;
    doc.fillColor(MAIN).font("Helvetica-Bold").fontSize(TITLE_SZ)
       .text("Proof you can point to.", cardX+pad, y);
    y += 28;

    doc.fillColor(SOFT).font("Helvetica").fontSize(10)
       .text(
         "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
         cardX+pad, y, { width: cardW - pad*2, lineGap: 1.2 }
       );
    y += 24;

    // Two columns
    const COL_GAP = 28;
    const colW = cardW - pad*2 - COL_GAP - QR_BLOCK;

    const lx = cardX + pad;
    let ly = y + 8;

    // Section heading
    doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(15).text("Proof Summary", lx, ly - 10);
    ly += 8;

    const divider = (yy) => {
      doc.strokeColor(DIVIDER).lineWidth(1)
         .moveTo(lx, yy).lineTo(lx + colW, yy).stroke();
    };

    const row = (label, value, help) => {
      divider(ly + 2);
      const labelFont = () => doc.fillColor(ACCENT).font("Helvetica-Bold").fontSize(LABEL_SZ);
      const valueFont = () => doc.fillColor(MAIN).font("Helvetica-Bold").fontSize(VALUE_SZ);
      const helpFont  = () => doc.fillColor(SOFT).font("Helvetica").fontSize(HELP_SZ);

      // label & value (compute height to avoid collisions)
      labelFont().text(label, lx, ly + 6);
      const valueHeight = doc.heightOfString(value, { width: colW - (VALUE_X - lx), lineGap: 1 });
      valueFont().text(value, lx + VALUE_X, ly + 6, { width: colW - (VALUE_X - lx), lineGap: 1 });

      const lineH = Math.max(doc.currentLineHeight(), valueHeight);
      ly += 6 + lineH;

      if (help) {
        const h = doc.heightOfString(help, { width: colW, lineGap: 1.1 });
        helpFont().text(help, lx, ly, { width: colW, lineGap: 1.1 });
        ly += h + 10; // more breathing room
      } else {
        ly += 10;
      }
    };

    row("Proof ID",        proofId,     "Your permanent reference for this proof. Keep it with your records.");
    row("Quick Verify ID", quickId,     "10-character code you can paste at docuProof.io/verify for fast lookups.");
    row("Created (UTC)",   createdUtc,  "Timestamp when this PDF was generated on the server.");
    row("File Name",       filename,    "Original filename you submitted for hashing.");
    row("Display Name",    displayName, "Human-friendly name that appears on your proof.");
    row("Public Verify URL", verifyUrl, "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.");

    // QR column (smaller)
    const qrX = cardX + pad + colW + COL_GAP;
    const qrY = y;
    const inner = QR_BLOCK - FRAME*2;

    doc.save().rect(qrX, qrY, QR_BLOCK, QR_BLOCK).fill("#49FFA0").restore();
    doc.save().rect(qrX + FRAME, qrY + FRAME, inner, inner).fill("#16FF70").restore();
    doc.image(qrPng, qrX + FRAME, qrY + FRAME, { width: inner, height: inner });

    // Footer
    doc.moveTo(leftX, cardY + cardH + 14).lineTo(rightX, cardY + cardH + 14).strokeColor(DIVIDER).lineWidth(1).stroke();
    doc.fillColor(SOFT).font("Helvetica").fontSize(9)
       .text("docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
             leftX, cardY + cardH + 24, { width: doc.page.width - leftX - 54 });
    doc.fillColor(SOFT).text(`© ${new Date().getUTCFullYear()} docuProof.io — All rights reserved.`, leftX, cardY + cardH + 40);

    doc.end();
    const buffer = await done;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "no-store,no-cache,must-revalidate",
        "Content-Length": String(buffer.length),
        "x-docuproof-version": "proof_pdf v5.3.2 (smaller text, less crowding, smaller QR, bigger header logo)"
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
      body: JSON.stringify({
        ok: false,
        error: "PDF build failed",
        detail: String(err && err.message || err),
        stack: (err && err.stack ? String(err.stack).split("\n").slice(0, 4) : [])
      })
    };
  }
};