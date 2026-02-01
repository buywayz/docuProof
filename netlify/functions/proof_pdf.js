// netlify/functions/proof_pdf.js
// v10.0.0 – Using pdf-lib instead of PDFKit for reliable single-page layout

const fs = require("fs");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");

// Helper: hex color to rgb (0-1 range)
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

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
    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    
    // Set metadata
    pdfDoc.setTitle("Certificate of Proof of Existence");
    pdfDoc.setAuthor("docuProof.io");
    pdfDoc.setSubject(`Proof ID: ${id}`);
    pdfDoc.setCreator("docuProof Certificate Generator v10.0.0");

    // Add single page - US Letter (612 x 792 points)
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    // Embed fonts
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Colors
    const green = hexToRgb("#22c55e");
    const darkGreen = hexToRgb("#15803d");
    const black = hexToRgb("#1f2937");
    const gray = hexToRgb("#6b7280");
    const lightGray = hexToRgb("#9ca3af");
    const borderGray = hexToRgb("#d1d5db");
    const bgGray = hexToRgb("#f3f4f6");
    const white = rgb(1, 1, 1);
    const logoBg = hexToRgb("#0f172a");

    // ══════════════════════════════════════════════════════════════════════
    // TOP CORNER ACCENTS
    // ══════════════════════════════════════════════════════════════════════
    const cornerSize = 36;
    const cornerOffset = 20;
    const cornerWidth = 3;

    // Top-left
    page.drawLine({ start: { x: cornerOffset, y: height - cornerOffset }, end: { x: cornerOffset, y: height - cornerOffset - cornerSize }, thickness: cornerWidth, color: green });
    page.drawLine({ start: { x: cornerOffset, y: height - cornerOffset }, end: { x: cornerOffset + cornerSize, y: height - cornerOffset }, thickness: cornerWidth, color: green });

    // Top-right
    page.drawLine({ start: { x: width - cornerOffset, y: height - cornerOffset }, end: { x: width - cornerOffset, y: height - cornerOffset - cornerSize }, thickness: cornerWidth, color: green });
    page.drawLine({ start: { x: width - cornerOffset, y: height - cornerOffset }, end: { x: width - cornerOffset - cornerSize, y: height - cornerOffset }, thickness: cornerWidth, color: green });

    // ══════════════════════════════════════════════════════════════════════
    // LOGO WITH DARK BACKGROUND
    // ══════════════════════════════════════════════════════════════════════
    let y = height - 60;
    const logoBoxSize = 52;
    const logoBoxX = (width - logoBoxSize) / 2;

    // Dark background rectangle for logo
    page.drawRectangle({
      x: logoBoxX,
      y: y - logoBoxSize,
      width: logoBoxSize,
      height: logoBoxSize,
      color: logoBg,
    });

    // Try to embed logo image
    const logoPaths = ["./netlify/functions/assets/logo_nobg.png", "./netlify/functions/assets/logo.png", "./docuproof-logo.png"];
    let logoImage = null;
    for (const p of logoPaths) {
      if (fs.existsSync(p)) {
        const logoBytes = fs.readFileSync(p);
        try {
          logoImage = await pdfDoc.embedPng(logoBytes);
        } catch {
          try {
            logoImage = await pdfDoc.embedJpg(logoBytes);
          } catch { /* skip */ }
        }
        if (logoImage) break;
      }
    }

    if (logoImage) {
      const logoPad = 4;
      const logoSize = logoBoxSize - logoPad * 2;
      page.drawImage(logoImage, {
        x: logoBoxX + logoPad,
        y: y - logoBoxSize + logoPad,
        width: logoSize,
        height: logoSize,
      });
    }

    y -= logoBoxSize + 15;

    // ══════════════════════════════════════════════════════════════════════
    // BRAND NAME AND TAGLINE
    // ══════════════════════════════════════════════════════════════════════
    const brandText = "docuProof";
    const brandWidth = helveticaBold.widthOfTextAtSize(brandText, 22);
    page.drawText(brandText, {
      x: (width - brandWidth) / 2,
      y: y,
      size: 22,
      font: helveticaBold,
      color: green,
    });
    y -= 18;

    const tagline = "Proof you can point to.";
    const taglineWidth = helveticaOblique.widthOfTextAtSize(tagline, 10);
    page.drawText(tagline, {
      x: (width - taglineWidth) / 2,
      y: y,
      size: 10,
      font: helveticaOblique,
      color: gray,
    });
    y -= 14;

    // Three dots
    const dotRadius = 3;
    const dotSpacing = 18;
    const dotY = y;
    page.drawCircle({ x: width / 2 - dotSpacing, y: dotY, size: dotRadius, color: green });
    page.drawCircle({ x: width / 2, y: dotY, size: dotRadius, color: green });
    page.drawCircle({ x: width / 2 + dotSpacing, y: dotY, size: dotRadius, color: green });
    y -= 22;

    // ══════════════════════════════════════════════════════════════════════
    // CERTIFICATE TITLE
    // ══════════════════════════════════════════════════════════════════════
    const certOfText = "CERTIFICATE OF";
    const certOfWidth = helvetica.widthOfTextAtSize(certOfText, 10);
    page.drawText(certOfText, {
      x: (width - certOfWidth) / 2,
      y: y,
      size: 10,
      font: helvetica,
      color: lightGray,
    });
    y -= 28;

    const titleText = "PROOF OF EXISTENCE";
    const titleWidth = helveticaBold.widthOfTextAtSize(titleText, 26);
    page.drawText(titleText, {
      x: (width - titleWidth) / 2,
      y: y,
      size: 26,
      font: helveticaBold,
      color: black,
    });
    y -= 16;

    const subtitleText = "Blockchain-Anchored Timestamp";
    const subtitleWidth = helvetica.widthOfTextAtSize(subtitleText, 9);
    page.drawText(subtitleText, {
      x: (width - subtitleWidth) / 2,
      y: y,
      size: 9,
      font: helvetica,
      color: lightGray,
    });
    y -= 28;

    // ══════════════════════════════════════════════════════════════════════
    // DOCUMENT DETAILS BOX
    // ══════════════════════════════════════════════════════════════════════
    const boxMargin = 60;
    const boxWidth = width - boxMargin * 2;
    const boxHeight = 115;
    const boxX = boxMargin;
    const boxY = y - boxHeight;
    const headerHeight = 24;

    // Box border
    page.drawRectangle({ x: boxX, y: boxY, width: boxWidth, height: boxHeight, borderColor: borderGray, borderWidth: 1 });
    
    // Header background
    page.drawRectangle({ x: boxX, y: boxY + boxHeight - headerHeight, width: boxWidth, height: headerHeight, color: bgGray });

    // Header text
    page.drawText("DOCUMENT DETAILS", {
      x: boxX + 15,
      y: boxY + boxHeight - headerHeight + 7,
      size: 9,
      font: helveticaBold,
      color: darkGreen,
    });

    // Detail rows
    const labelX = boxX + 15;
    const valueX = boxX + 100;
    let rowY = boxY + boxHeight - headerHeight - 20;
    const rowHeight = 20;
    const blockDisplay = blockHeight ? `#${blockHeight}` : "Pending confirmation";

    const details = [
      ["Proof ID:", id],
      ["Document:", display],
      ["Timestamp:", formatDate(createdAt)],
      ["Block:", blockDisplay],
    ];

    for (const [label, value] of details) {
      page.drawText(label, { x: labelX, y: rowY, size: 10, font: helvetica, color: gray });
      page.drawText(value, { x: valueX, y: rowY, size: 10, font: helveticaBold, color: black });
      rowY -= rowHeight;
    }

    // QR Code
    const qrSize = 75;
    const qrX = boxX + boxWidth - qrSize - 12;
    const qrY = boxY + boxHeight - headerHeight - qrSize - 8;
    
    const qrPng = await QRCode.toBuffer(verifyUrl, {
      width: 150,
      margin: 0,
      color: { dark: "#1f2937", light: "#ffffff" },
      errorCorrectionLevel: "M"
    });
    const qrImage = await pdfDoc.embedPng(qrPng);
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

    // QR label
    const qrLabel = "SCAN TO VERIFY";
    const qrLabelWidth = helveticaBold.widthOfTextAtSize(qrLabel, 6);
    page.drawText(qrLabel, {
      x: qrX + (qrSize - qrLabelWidth) / 2,
      y: qrY - 10,
      size: 6,
      font: helveticaBold,
      color: black,
    });

    y = boxY - 15;

    // ══════════════════════════════════════════════════════════════════════
    // SHA-256 HASH BOX
    // ══════════════════════════════════════════════════════════════════════
    if (hash) {
      const hashBoxHeight = 45;
      const hashBoxY = y - hashBoxHeight;

      page.drawRectangle({ x: boxX, y: hashBoxY, width: boxWidth, height: hashBoxHeight, borderColor: borderGray, borderWidth: 1 });

      page.drawText("CRYPTOGRAPHIC FINGERPRINT (SHA-256)", {
        x: boxX + 15,
        y: hashBoxY + hashBoxHeight - 15,
        size: 8,
        font: helveticaBold,
        color: darkGreen,
      });

      page.drawText(hash, {
        x: boxX + 15,
        y: hashBoxY + 10,
        size: 7,
        font: helvetica,
        color: black,
      });

      y = hashBoxY - 12;
    }

    // ══════════════════════════════════════════════════════════════════════
    // LEGAL ATTESTATION BOX
    // ══════════════════════════════════════════════════════════════════════
    const attBoxHeight = 85;
    const attBoxY = y - attBoxHeight;

    page.drawRectangle({ x: boxX, y: attBoxY, width: boxWidth, height: attBoxHeight, borderColor: borderGray, borderWidth: 1 });
    page.drawRectangle({ x: boxX, y: attBoxY + attBoxHeight - headerHeight, width: boxWidth, height: headerHeight, color: bgGray });

    page.drawText("LEGAL ATTESTATION", {
      x: boxX + 15,
      y: attBoxY + attBoxHeight - headerHeight + 7,
      size: 9,
      font: helveticaBold,
      color: darkGreen,
    });

    const attText = [
      "This certificate attests that on the date and time indicated above, a cryptographic hash",
      "(SHA-256) of the referenced digital file was computed and submitted to the Bitcoin",
      "blockchain via the OpenTimestamps protocol. The blockchain record provides tamper-",
      "evident proof that the file existed in its exact form at the timestamp recorded. This proof",
      "is independently verifiable by any party using the original file and standard cryptographic tools."
    ];

    let attY = attBoxY + attBoxHeight - headerHeight - 14;
    for (const line of attText) {
      page.drawText(line, { x: boxX + 15, y: attY, size: 8, font: helvetica, color: black });
      attY -= 11;
    }

    y = attBoxY - 12;

    // ══════════════════════════════════════════════════════════════════════
    // HOW TO VERIFY BOX
    // ══════════════════════════════════════════════════════════════════════
    const verifyBoxHeight = 75;
    const verifyBoxY = y - verifyBoxHeight;

    page.drawRectangle({ x: boxX, y: verifyBoxY, width: boxWidth, height: verifyBoxHeight, borderColor: borderGray, borderWidth: 1 });
    page.drawRectangle({ x: boxX, y: verifyBoxY + verifyBoxHeight - headerHeight, width: boxWidth, height: headerHeight, color: bgGray });

    page.drawText("HOW TO VERIFY THIS PROOF", {
      x: boxX + 15,
      y: verifyBoxY + verifyBoxHeight - headerHeight + 7,
      size: 9,
      font: helveticaBold,
      color: darkGreen,
    });

    const steps = [
      "1. Visit the verification URL or scan the QR code",
      "2. Upload your original file to compute its SHA-256 hash",
      "3. Confirm the hash matches the recorded fingerprint",
      "4. Verify the Bitcoin block confirmation on any block explorer"
    ];

    let stepY = verifyBoxY + verifyBoxHeight - headerHeight - 14;
    for (const step of steps) {
      page.drawText(step, { x: boxX + 15, y: stepY, size: 8, font: helvetica, color: black });
      stepY -= 12;
    }

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════════════════
    const footerY = 45;

    // Green line
    page.drawLine({
      start: { x: width / 2 - 120, y: footerY + 8 },
      end: { x: width / 2 + 120, y: footerY + 8 },
      thickness: 2,
      color: green,
    });

    // Footer text
    const footerText = "docuProof.io  •  Proof of Existence on the Blockchain";
    const footerWidth = helvetica.widthOfTextAtSize(footerText, 8);
    page.drawText(footerText, {
      x: (width - footerWidth) / 2,
      y: footerY - 5,
      size: 8,
      font: helvetica,
      color: gray,
    });

    // ══════════════════════════════════════════════════════════════════════
    // SERIALIZE PDF
    // ══════════════════════════════════════════════════════════════════════
    const pdfBytes = await pdfDoc.save();

    const safeBase = (filename || "document").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
    const outputFilename = `${safeBase}-docuProof-certificate.pdf`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${outputFilename}"`,
        "Cache-Control": "no-store",
        "x-docuproof-version": "proof_pdf v10.0.0",
      },
      body: Buffer.from(pdfBytes).toString("base64"),
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
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return isoString;
  }
}
