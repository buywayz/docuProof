// netlify/functions/proof_pdf.js
// Runtime: Node 18 (Netlify). No external fonts required.
// Deps in package.json: "pdfkit", "qrcode"
const path = require("path");
const fs   = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

exports.handler = async (event) => {
  try {
    // -------- parse inputs --------
    const q = new URLSearchParams(event.queryStringParameters || {});
    const proofId     = (q.get("id") || "qa_"+Date.now()).trim();
    const filename    = (q.get("filename") || "Launch-Test.pdf").trim();
    const displayName = (q.get("displayName") || "Launch Sync Test").trim();
    const verifyUrl   = (q.get("verifyUrl") || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`).trim();
    const quickId     = (q.get("quickId") || Math.random().toString(16).slice(2, 10)).trim();
    const createdUtc  = new Date().toISOString();

    // -------- resolve assets (small header logo, transparent if available) --------
    const fnRoot = process.env.LAMBDA_TASK_ROOT || process.cwd();
    const tryPaths = [
      path.join(fnRoot, "netlify/functions/assets/logo_nobg.png"),
      path.join(fnRoot, "netlify/functions/assets/logo.png"),
    ];
    let logoPath = null;
    for (const p of tryPaths) { if (fs.existsSync(p)) { logoPath = p; break; } }

    // -------- build QR PNG buffer (green light, black dark) --------
    const qrPng = await QRCode.toBuffer(verifyUrl, {
      type: "png",
      errorCorrectionLevel: "Q",
      margin: 2,
      color: { dark: "#000000", light: "#16FF70" } // black modules, neon green background
    });

    // -------- make PDF --------
    const doc = new PDFDocument({
      size: "LETTER", // 612 x 792 pt
      margin: 36,     // outer margin
      pdfVersion: "1.3"
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    // Colors / sizes
    const bgDark      = "#0b0d0f";
    const textMain    = "#E6E7EB";
    const textSoft    = "#9aa3ab";
    const accent      = "#16FF70";
    const divider     = "#1a1f24";

    // page background
    doc.rect(0, 0, doc.page.width, doc.page.height).fill(bgDark);
    doc.fillColor(textMain);

    // Header: small logo + title
    const headerY = 54;
    const leftX   = 54;
    const rightX  = doc.page.width - 54;
    const headerGap = 10;

    let cursorX = leftX;
    if (logoPath) {
      const h = 20; // small, unobtrusive
      doc.image(logoPath, cursorX, headerY - h + 2, { height: h });
      // small gap after logo
      cursorX += h + 8;
    }

    doc.font("Helvetica-Bold").fontSize(18).fillColor(accent)
       .text("docuProof.io", cursorX, headerY - 12, { continued: true });
    doc.fillColor(textMain).text(" — Proof you can point to.", { continued: false });

    // Divider
    doc.moveTo(leftX, headerY + 12).lineTo(rightX, headerY + 12).strokeColor(divider).lineWidth(1).stroke();

    // Card container
    const cardX = leftX;
    const cardY = headerY + 28;
    const cardW = doc.page.width - leftX - 54;
    const cardH = 520;

    doc.save()
       .roundedRect(cardX, cardY, cardW, cardH, 10)
       .fillOpacity(0.92).fill("#101417")
       .restore();

    // Title inside card
    const innerPad = 24;
    let y = cardY + innerPad;
    doc.fillColor(textMain).font("Helvetica-Bold").fontSize(28)
       .text("Proof you can point to.", cardX + innerPad, y);
    y += 36;

    // Subtitle helper
    doc.fillColor(textSoft).font("Helvetica").fontSize(11)
       .text(
         "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
         cardX + innerPad,
         y,
         { width: cardW - innerPad * 2 }
       );
    y += 28;

    // Left column width and QR block on right
    const colGap = 24;
    const qrBlockW = 260;
    const colW = cardW - innerPad * 2 - qrBlockW - colGap;

    // Draw the “table” in left column
    const lx = cardX + innerPad;
    let ly = y + 8;

    const row = (label, value, help) => {
      const labelY = ly;
      doc.strokeColor(divider).lineWidth(1)
         .moveTo(lx, labelY - 6).lineTo(lx + colW, labelY - 6).stroke();

      doc.fillColor(accent).font("Helvetica-Bold").fontSize(12)
         .text(label, lx, labelY);

      doc.fillColor(textMain).font("Helvetica-Bold").fontSize(12)
         .text(value, lx + 110, labelY, { width: colW - 110 });

      ly += 16;

      if (help) {
        doc.fillColor(textSoft).font("Helvetica").fontSize(10)
           .text(help, lx, ly, { width: colW });
        ly += 16;
      }

      ly += 6; // row spacing
    };

    doc.fillColor(accent).font("Helvetica-Bold").fontSize(16).text("Proof Summary", lx, ly - 10);
    ly += 12;

    row("Proof ID", proofId, "Your permanent reference for this proof. Keep it with your records.");
    row("Quick Verify ID", quickId, "10-character code you can paste at docuProof.io/verify for fast lookups.");
    row("Created (UTC)", createdUtc, "Timestamp when this PDF was generated on the server.");
    row("File Name", filename, "Original filename you submitted for hashing.");
    row("Display Name", displayName, "Human-friendly name that appears on your proof.");
    row("Public Verify URL", verifyUrl, "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.");

    // Right: QR with frame
    const qrX = cardX + innerPad + colW + colGap;
    const qrY = y;
    const frame = 14;
    const qrInner = qrBlockW - frame * 2;

    // neon frame (outer)
    doc.save()
       .rect(qrX, qrY, qrBlockW, qrBlockW)
       .fillOpacity(1.0).fill("#49FFA0")
       .restore();

    // inner green background to match modules “light” color
    doc.save()
       .rect(qrX + frame, qrY + frame, qrInner, qrInner)
       .fillOpacity(1.0).fill("#16FF70")
       .restore();

    // place QR PNG centered in inner square
    doc.image(qrPng, qrX + frame, qrY + frame, { width: qrInner, height: qrInner, align: "center", valign: "center" });

    // Footer line
    doc.moveTo(leftX, cardY + cardH + 14).lineTo(rightX, cardY + cardH + 14).strokeColor(divider).lineWidth(1).stroke();

    // Legal footer
    doc.fillColor(textSoft).font("Helvetica").fontSize(9)
       .text(
         "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
         leftX,
         cardY + cardH + 24,
         { width: doc.page.width - leftX - 54 }
       );
    doc.fillColor(textSoft).text(`© ${new Date().getUTCFullYear()} docuProof.io — All rights reserved.`, leftX, cardY + cardH + 40);

    // Close & return
    doc.end();
    const buffer = await done;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename.replace(/"/g, "")}"`,
        "Cache-Control": "no-store,no-cache,must-revalidate",
        "Content-Length": String(buffer.length),
        "x-docuproof-version": "proof_pdf v5.3.0 (pdfkit + qrpng)"
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