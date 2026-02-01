// netlify/functions/proof_pdf.js
// v8.0.0 – Legal document styling, single page guaranteed, centered layout

const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

// Convert inches to points (72 points per inch)
function inch(n) { return n * 72; }

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
    // US Letter: 612 x 792 points (8.5" x 11")
    const pageW = 612;
    const pageH = 792;
    const marginL = inch(0.75);
    const marginR = inch(0.75);
    const marginT = inch(0.6);
    const marginB = inch(0.6);
    const contentW = pageW - marginL - marginR;
    const centerX = pageW / 2;

    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: marginT, bottom: marginB, left: marginL, right: marginR },
      autoFirstPage: true,
      bufferPages: false, // Prevent automatic page creation
      info: {
        Title: "Certificate of Proof of Existence",
        Author: "docuProof.io",
        Subject: `Proof ID: ${id}`,
        Creator: "docuProof Certificate Generator v8.0.0"
      }
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    // Colors
    const green = "#22c55e";
    const darkGreen = "#15803d";
    const black = "#111827";
    const gray = "#4b5563";
    const lightGray = "#6b7280";
    const borderColor = "#d1d5db";
    const headerBg = "#f3f4f6";

    // Fill white background
    doc.rect(0, 0, pageW, pageH).fill("#ffffff");

    // ═══════════════════════════════════════════════════════════════════════════
    // CORNER ACCENTS (top corners only)
    // ═══════════════════════════════════════════════════════════════════════════
    const cornerSize = inch(0.5);
    const cornerOffset = inch(0.3);
    doc.lineWidth(3).strokeColor(green);
    
    // Top-left corner
    doc.moveTo(cornerOffset, cornerOffset + cornerSize)
       .lineTo(cornerOffset, cornerOffset)
       .lineTo(cornerOffset + cornerSize, cornerOffset)
       .stroke();
    
    // Top-right corner
    doc.moveTo(pageW - cornerOffset - cornerSize, cornerOffset)
       .lineTo(pageW - cornerOffset, cornerOffset)
       .lineTo(pageW - cornerOffset, cornerOffset + cornerSize)
       .stroke();

    // ═══════════════════════════════════════════════════════════════════════════
    // HEADER SECTION
    // ═══════════════════════════════════════════════════════════════════════════
    let y = marginT + inch(0.2);

    // Logo with dark background
    const logoPaths = [
      "./netlify/functions/assets/logo_nobg.png",
      "./netlify/functions/assets/logo.png",
      "./docuproof-logo.png"
    ];
    let logoUsed = null;
    for (const p of logoPaths) {
      if (fs.existsSync(p)) { logoUsed = p; break; }
    }

    if (logoUsed) {
      const logoSize = inch(0.65);
      const logoPad = inch(0.06);
      const bgSize = logoSize + logoPad * 2;
      doc.roundedRect(centerX - bgSize / 2, y, bgSize, bgSize, 6).fill("#0f172a");
      doc.image(logoUsed, centerX - logoSize / 2, y + logoPad, { width: logoSize, height: logoSize });
      y += bgSize + inch(0.15);
    }

    // Brand name
    doc.font("Helvetica-Bold").fontSize(20).fillColor(green);
    doc.text("docuProof", marginL, y, { width: contentW, align: "center" });
    y += inch(0.28);

    // Tagline
    doc.font("Helvetica-Oblique").fontSize(10).fillColor(gray);
    doc.text("Proof you can point to.", marginL, y, { width: contentW, align: "center" });
    y += inch(0.22);

    // Three dots
    const dotRadius = 3;
    const dotSpacing = 20;
    doc.circle(centerX - dotSpacing, y, dotRadius).fill(green);
    doc.circle(centerX, y, dotRadius).fill(green);
    doc.circle(centerX + dotSpacing, y, dotRadius).fill(green);
    y += inch(0.28);

    // "CERTIFICATE OF"
    doc.font("Helvetica").fontSize(11).fillColor(lightGray);
    doc.text("CERTIFICATE OF", marginL, y, { width: contentW, align: "center", characterSpacing: 3 });
    y += inch(0.22);

    // "PROOF OF EXISTENCE"
    doc.font("Helvetica-Bold").fontSize(26).fillColor(black);
    doc.text("PROOF OF EXISTENCE", marginL, y, { width: contentW, align: "center" });
    y += inch(0.32);

    // Subtitle
    doc.font("Helvetica").fontSize(9).fillColor(lightGray);
    doc.text("Blockchain-Anchored Timestamp", marginL, y, { width: contentW, align: "center" });
    y += inch(0.35);

    // ═══════════════════════════════════════════════════════════════════════════
    // DOCUMENT DETAILS BOX
    // ═══════════════════════════════════════════════════════════════════════════
    const boxMargin = inch(0.15);
    const boxL = marginL + boxMargin;
    const boxW = contentW - boxMargin * 2;
    const detailsBoxH = inch(1.5);

    // Box border
    doc.lineWidth(1).strokeColor(borderColor);
    doc.rect(boxL, y, boxW, detailsBoxH).stroke();

    // Header background
    const headerH = inch(0.32);
    doc.rect(boxL, y, boxW, headerH).fill(headerBg);

    // Header text
    doc.font("Helvetica-Bold").fontSize(10).fillColor(darkGreen);
    doc.text("DOCUMENT DETAILS", boxL + inch(0.2), y + inch(0.09));

    // Detail rows
    const labelX = boxL + inch(0.2);
    const valueX = boxL + inch(1.3);
    let rowY = y + headerH + inch(0.15);
    const rowHeight = inch(0.28);

    const blockDisplay = blockHeight ? `#${blockHeight}` : "Pending confirmation";
    const details = [
      ["Proof ID:", id],
      ["Document:", display],
      ["Timestamp:", formatDate(createdAt)],
      ["Block:", blockDisplay]
    ];

    doc.font("Helvetica").fontSize(11).fillColor(gray);
    for (const [label, value] of details) {
      doc.text(label, labelX, rowY);
      doc.font("Helvetica-Bold").fillColor(black);
      doc.text(value, valueX, rowY, { width: boxW - inch(2.5) });
      doc.font("Helvetica").fillColor(gray);
      rowY += rowHeight;
    }

    // QR Code
    const qrSize = inch(0.95);
    const qrX = boxL + boxW - qrSize - inch(0.15);
    const qrY = y + headerH + inch(0.08);
    const qrPng = await QRCode.toBuffer(verifyUrl, {
      width: 190,
      margin: 0,
      color: { dark: "#111827", light: "#ffffff" },
      errorCorrectionLevel: "M"
    });
    doc.image(qrPng, qrX, qrY, { width: qrSize });
    
    // "SCAN TO VERIFY" label
    doc.font("Helvetica-Bold").fontSize(7).fillColor(black);
    doc.text("SCAN TO VERIFY", qrX, qrY + qrSize + inch(0.04), { width: qrSize, align: "center" });

    y += detailsBoxH + inch(0.18);

    // ═══════════════════════════════════════════════════════════════════════════
    // CRYPTOGRAPHIC FINGERPRINT BOX (if hash provided)
    // ═══════════════════════════════════════════════════════════════════════════
    if (hash) {
      const hashBoxH = inch(0.55);
      doc.lineWidth(1).strokeColor(borderColor);
      doc.rect(boxL, y, boxW, hashBoxH).stroke();

      doc.font("Helvetica-Bold").fontSize(9).fillColor(darkGreen);
      doc.text("CRYPTOGRAPHIC FINGERPRINT (SHA-256)", boxL + inch(0.2), y + inch(0.1));

      doc.font("Helvetica").fontSize(7.5).fillColor(black);
      doc.text(hash, boxL + inch(0.2), y + inch(0.32), { width: boxW - inch(0.4) });

      y += hashBoxH + inch(0.15);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LEGAL ATTESTATION BOX
    // ═══════════════════════════════════════════════════════════════════════════
    const attBoxH = inch(1.1);
    doc.lineWidth(1).strokeColor(borderColor);
    doc.rect(boxL, y, boxW, attBoxH).stroke();

    // Header
    doc.rect(boxL, y, boxW, headerH).fill(headerBg);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(darkGreen);
    doc.text("LEGAL ATTESTATION", boxL + inch(0.2), y + inch(0.09));

    // Attestation text
    const attestationText = "This certificate attests that on the date and time indicated above, a cryptographic hash (SHA-256) of the referenced digital file was computed and submitted to the Bitcoin blockchain via the OpenTimestamps protocol. The blockchain record provides tamper-evident proof that the file existed in its exact form at the timestamp recorded. This proof is independently verifiable by any party using the original file and standard cryptographic tools.";
    
    doc.font("Helvetica").fontSize(9).fillColor(black);
    doc.text(attestationText, boxL + inch(0.2), y + headerH + inch(0.1), {
      width: boxW - inch(0.4),
      lineGap: 2,
      align: "justify"
    });

    y += attBoxH + inch(0.15);

    // ═══════════════════════════════════════════════════════════════════════════
    // HOW TO VERIFY BOX
    // ═══════════════════════════════════════════════════════════════════════════
    const verifyBoxH = inch(0.95);
    doc.lineWidth(1).strokeColor(borderColor);
    doc.rect(boxL, y, boxW, verifyBoxH).stroke();

    // Header
    doc.rect(boxL, y, boxW, headerH).fill(headerBg);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(darkGreen);
    doc.text("HOW TO VERIFY THIS PROOF", boxL + inch(0.2), y + inch(0.09));

    // Verification steps
    const steps = [
      "1. Visit the verification URL or scan the QR code",
      "2. Upload your original file to compute its SHA-256 hash",
      "3. Confirm the hash matches the recorded fingerprint",
      "4. Verify the Bitcoin block confirmation on any block explorer"
    ];

    let stepY = y + headerH + inch(0.1);
    doc.font("Helvetica").fontSize(9).fillColor(black);
    for (const step of steps) {
      doc.text(step, boxL + inch(0.2), stepY, { width: boxW - inch(0.4) });
      stepY += inch(0.15);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FOOTER - positioned from bottom of page
    // ═══════════════════════════════════════════════════════════════════════════
    const footerLineY = pageH - inch(0.55);
    const footerTextY = pageH - inch(0.42);

    // Green decorative line
    doc.lineWidth(2).strokeColor(green);
    doc.moveTo(centerX - inch(2), footerLineY)
       .lineTo(centerX + inch(2), footerLineY)
       .stroke();

    // Footer text
    doc.font("Helvetica").fontSize(9).fillColor(gray);
    doc.text("docuProof.io  •  Proof of Existence on the Blockchain", marginL, footerTextY, {
      width: contentW,
      align: "center"
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // FINALIZE
    // ═══════════════════════════════════════════════════════════════════════════
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
        "x-docuproof-version": "proof_pdf v8.0.0",
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
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return isoString;
  }
}
