// netlify/functions/proof_pdf.js
// v9.0.0 – Complete redesign using document flow, not absolute positioning

const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

exports.handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const id = qp.id || "unknown";
  const display = qp.displayName || "Untitled";
  const hash = qp.hash || null;
  const verifyUrl = qp.verifyUrl || `https://docuproof.io/v/${encodeURIComponent(id)}`;
  const blockHeight = qp.block || qp.blockHeight || null;
  const createdAt = qp.createdAt || new Date().toISOString();
  const filename = qp.filename || qp.displayName || "document";

  try {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 50,
      info: {
        Title: "Certificate of Proof of Existence",
        Author: "docuProof.io",
        Subject: `Proof ID: ${id}`,
        Creator: "docuProof Certificate Generator v9.0.0"
      }
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    const pageW = 612;
    const green = "#22c55e";
    const darkGreen = "#15803d";
    const black = "#1f2937";
    const gray = "#6b7280";

    // ══════════════════════════════════════════════════════════════════════
    // DECORATIVE TOP BORDER
    // ══════════════════════════════════════════════════════════════════════
    doc.rect(0, 0, pageW, 8).fill(green);

    // ══════════════════════════════════════════════════════════════════════
    // HEADER - Logo and Brand
    // ══════════════════════════════════════════════════════════════════════
    doc.moveDown(0.5);

    // Try to load logo
    const logoPaths = ["./netlify/functions/assets/logo_nobg.png", "./netlify/functions/assets/logo.png", "./docuproof-logo.png"];
    let logoUsed = null;
    for (const p of logoPaths) { if (fs.existsSync(p)) { logoUsed = p; break; } }

    if (logoUsed) {
      doc.image(logoUsed, (pageW - 50) / 2, doc.y, { width: 50 });
      doc.moveDown(3.5);
    }

    // Brand name
    doc.fontSize(24).fillColor(green).font("Helvetica-Bold")
       .text("docuProof", { align: "center" });
    
    doc.fontSize(11).fillColor(gray).font("Helvetica-Oblique")
       .text("Proof you can point to.", { align: "center" });
    
    doc.moveDown(0.8);

    // Title
    doc.fontSize(10).fillColor(gray).font("Helvetica")
       .text("CERTIFICATE OF", { align: "center", characterSpacing: 2 });
    
    doc.fontSize(28).fillColor(black).font("Helvetica-Bold")
       .text("Proof of Existence", { align: "center" });
    
    doc.moveDown(1);

    // ══════════════════════════════════════════════════════════════════════
    // QR CODE - Centered prominently
    // ══════════════════════════════════════════════════════════════════════
    const qrSize = 100;
    const qrPng = await QRCode.toBuffer(verifyUrl, {
      width: 200,
      margin: 0,
      color: { dark: "#1f2937", light: "#ffffff" },
      errorCorrectionLevel: "M"
    });
    
    doc.image(qrPng, (pageW - qrSize) / 2, doc.y, { width: qrSize });
    doc.moveDown(5.5);
    
    doc.fontSize(9).fillColor(gray).font("Helvetica-Bold")
       .text("SCAN TO VERIFY INSTANTLY", { align: "center" });
    doc.fontSize(8).fillColor(gray).font("Helvetica")
       .text(verifyUrl, { align: "center", link: verifyUrl });
    
    doc.moveDown(1);

    // ══════════════════════════════════════════════════════════════════════
    // DOCUMENT DETAILS - Clean table layout
    // ══════════════════════════════════════════════════════════════════════
    const leftCol = 120;
    const rightCol = 200;
    const blockDisplay = blockHeight ? `Bitcoin Block #${blockHeight}` : "Pending blockchain confirmation";

    doc.fontSize(10).fillColor(darkGreen).font("Helvetica-Bold")
       .text("─────────────────────────────────────────────────────────────────", { align: "center" });
    doc.moveDown(0.3);

    // Row helper
    const addRow = (label, value) => {
      const y = doc.y;
      doc.fontSize(10).fillColor(gray).font("Helvetica").text(label, leftCol, y);
      doc.fontSize(10).fillColor(black).font("Helvetica-Bold").text(value, rightCol, y);
      doc.moveDown(0.6);
    };

    addRow("Proof ID:", id);
    addRow("Document:", display);
    addRow("Timestamp:", formatDate(createdAt));
    addRow("Anchored:", blockDisplay);

    if (hash) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor(darkGreen).font("Helvetica-Bold")
         .text("SHA-256 Fingerprint:", leftCol);
      doc.fontSize(8).fillColor(black).font("Helvetica")
         .text(hash, leftCol, doc.y, { width: 380 });
    }

    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(darkGreen).font("Helvetica-Bold")
       .text("─────────────────────────────────────────────────────────────────", { align: "center" });

    doc.moveDown(1);

    // ══════════════════════════════════════════════════════════════════════
    // WHAT IS THIS? - Educational section
    // ══════════════════════════════════════════════════════════════════════
    doc.fontSize(11).fillColor(darkGreen).font("Helvetica-Bold")
       .text("What is Proof of Existence?", 50);
    doc.moveDown(0.3);
    
    doc.fontSize(9).fillColor(black).font("Helvetica")
       .text("This certificate proves that a specific digital file existed at a specific point in time. " +
             "A unique cryptographic fingerprint (SHA-256 hash) of your document was permanently recorded " +
             "on the Bitcoin blockchain—the most secure and immutable ledger in the world. " +
             "This proof cannot be forged, altered, or deleted.", 
             50, doc.y, { width: 512, align: "justify", lineGap: 2 });

    doc.moveDown(1);

    // ══════════════════════════════════════════════════════════════════════
    // USE CASES
    // ══════════════════════════════════════════════════════════════════════
    doc.fontSize(11).fillColor(darkGreen).font("Helvetica-Bold")
       .text("Common Uses", 50);
    doc.moveDown(0.3);

    const uses = [
      "• Intellectual Property — Prove when you created original work",
      "• Legal Evidence — Establish document authenticity for disputes",
      "• Contracts — Verify agreements existed before a certain date",
      "• Research — Timestamp discoveries and data integrity"
    ];
    
    doc.fontSize(9).fillColor(black).font("Helvetica");
    uses.forEach(use => {
      doc.text(use, 50, doc.y, { width: 512 });
      doc.moveDown(0.3);
    });

    doc.moveDown(0.8);

    // ══════════════════════════════════════════════════════════════════════
    // HOW TO VERIFY
    // ══════════════════════════════════════════════════════════════════════
    doc.fontSize(11).fillColor(darkGreen).font("Helvetica-Bold")
       .text("How to Verify", 50);
    doc.moveDown(0.3);

    doc.fontSize(9).fillColor(black).font("Helvetica")
       .text("1. Scan the QR code or visit the verification URL above", 50)
       .text("2. Upload the original file to compute its hash", 50)
       .text("3. Confirm the hash matches the recorded fingerprint", 50)
       .text("4. Check the Bitcoin block on any public block explorer", 50);

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════════════════
    doc.fontSize(9).fillColor(gray).font("Helvetica")
       .text("docuProof.io  •  Blockchain-Anchored Document Timestamping", 
             50, 740, { width: 512, align: "center" });

    // Bottom green bar
    doc.rect(0, 784, pageW, 8).fill(green);

    // ══════════════════════════════════════════════════════════════════════
    // DONE
    // ══════════════════════════════════════════════════════════════════════
    doc.end();
    const pdf = await done;

    const safeBase = (filename || "document").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
    const outputFilename = `${safeBase}-docuProof-certificate.pdf`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${outputFilename}"`,
        "Cache-Control": "no-store",
        "x-docuproof-version": "proof_pdf v9.0.0",
      },
      body: pdf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message, stack: err.stack?.split("\n").slice(0, 5) }),
    };
  }
};

function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", { 
      weekday: "long",
      year: "numeric", 
      month: "long", 
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  } catch {
    return isoString;
  }
}
