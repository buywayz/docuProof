// netlify/functions/proof_pdf.js
// v11.0.0 – Premium certificate design with marketing content

const fs = require("fs");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");

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
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle("Certificate of Proof of Existence");
    pdfDoc.setAuthor("docuProof.io");
    pdfDoc.setSubject(`Proof ID: ${id}`);
    pdfDoc.setCreator("docuProof Certificate Generator v11.0.0");

    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Colors
    const green = hexToRgb("#22c55e");
    const darkGreen = hexToRgb("#15803d");
    const black = hexToRgb("#111827");
    const darkText = hexToRgb("#1f2937");
    const gray = hexToRgb("#6b7280");
    const lightGray = hexToRgb("#9ca3af");
    const borderGray = hexToRgb("#e5e7eb");
    const bgGray = hexToRgb("#f9fafb");
    const logoBg = hexToRgb("#0f172a");

    // Layout constants
    const marginX = 50;
    const contentWidth = width - marginX * 2;
    const centerX = width / 2;

    // ══════════════════════════════════════════════════════════════════════
    // DECORATIVE BORDER - Double line frame
    // ══════════════════════════════════════════════════════════════════════
    // Outer border
    page.drawRectangle({
      x: 25, y: 25, width: width - 50, height: height - 50,
      borderColor: green, borderWidth: 2
    });
    // Inner border
    page.drawRectangle({
      x: 32, y: 32, width: width - 64, height: height - 64,
      borderColor: hexToRgb("#86efac"), borderWidth: 0.5
    });

    // Corner flourishes
    const flourishSize = 20;
    const fo = 25; // flourish offset from edge
    
    // Top corners - small decorative squares
    page.drawRectangle({ x: fo - 5, y: height - fo - flourishSize + 5, width: flourishSize, height: flourishSize, color: green });
    page.drawRectangle({ x: width - fo - flourishSize + 5, y: height - fo - flourishSize + 5, width: flourishSize, height: flourishSize, color: green });

    // ══════════════════════════════════════════════════════════════════════
    // HEADER SECTION
    // ══════════════════════════════════════════════════════════════════════
    let y = height - 70;

    // Logo with properly sized dark background
    const logoPaths = ["./netlify/functions/assets/logo_nobg.png", "./netlify/functions/assets/logo.png", "./docuproof-logo.png"];
    let logoImage = null;
    for (const p of logoPaths) {
      if (fs.existsSync(p)) {
        const logoBytes = fs.readFileSync(p);
        try { logoImage = await pdfDoc.embedPng(logoBytes); } 
        catch { try { logoImage = await pdfDoc.embedJpg(logoBytes); } catch {} }
        if (logoImage) break;
      }
    }

    const logoSize = 40;
    const logoPadding = 6;
    const logoBoxSize = logoSize + logoPadding * 2;
    
    // Dark background - centered, square, minimal padding
    page.drawRectangle({
      x: centerX - logoBoxSize / 2,
      y: y - logoBoxSize,
      width: logoBoxSize,
      height: logoBoxSize,
      color: logoBg,
    });

    if (logoImage) {
      page.drawImage(logoImage, {
        x: centerX - logoSize / 2,
        y: y - logoBoxSize + logoPadding,
        width: logoSize,
        height: logoSize,
      });
    }
    y -= logoBoxSize + 12;

    // Brand name
    const brandText = "docuProof";
    const brandWidth = helveticaBold.widthOfTextAtSize(brandText, 24);
    page.drawText(brandText, { x: centerX - brandWidth / 2, y, size: 24, font: helveticaBold, color: green });
    y -= 16;

    // Tagline
    const tagline = "Proof you can point to.";
    const taglineWidth = helveticaOblique.widthOfTextAtSize(tagline, 10);
    page.drawText(tagline, { x: centerX - taglineWidth / 2, y, size: 10, font: helveticaOblique, color: gray });
    y -= 25;

    // Certificate title
    const titleLine1 = "CERTIFICATE OF";
    const titleLine1Width = helvetica.widthOfTextAtSize(titleLine1, 11);
    page.drawText(titleLine1, { x: centerX - titleLine1Width / 2, y, size: 11, font: helvetica, color: lightGray });
    y -= 30;

    const mainTitle = "PROOF OF EXISTENCE";
    const mainTitleWidth = helveticaBold.widthOfTextAtSize(mainTitle, 28);
    page.drawText(mainTitle, { x: centerX - mainTitleWidth / 2, y, size: 28, font: helveticaBold, color: black });
    y -= 14;

    const subtitle = "Immutable Blockchain Timestamp";
    const subtitleWidth = helvetica.widthOfTextAtSize(subtitle, 9);
    page.drawText(subtitle, { x: centerX - subtitleWidth / 2, y, size: 9, font: helvetica, color: gray });
    y -= 25;

    // Decorative divider
    page.drawLine({ start: { x: centerX - 80, y }, end: { x: centerX + 80, y }, thickness: 1, color: green });
    y -= 20;

    // ══════════════════════════════════════════════════════════════════════
    // DOCUMENT DETAILS + QR CODE (side by side)
    // ══════════════════════════════════════════════════════════════════════
    const detailsStartY = y;
    const qrSize = 80;
    const qrX = width - marginX - qrSize - 10;
    const detailsWidth = qrX - marginX - 20;

    // Labels and values
    const blockDisplay = blockHeight ? `Bitcoin Block #${blockHeight}` : "Pending blockchain confirmation";
    const details = [
      ["PROOF ID", id],
      ["DOCUMENT", display],
      ["TIMESTAMP", formatDate(createdAt)],
      ["BLOCKCHAIN ANCHOR", blockDisplay],
    ];

    let detailY = y;
    for (const [label, value] of details) {
      page.drawText(label, { x: marginX, y: detailY, size: 8, font: helveticaBold, color: darkGreen });
      detailY -= 12;
      page.drawText(value, { x: marginX, y: detailY, size: 11, font: helvetica, color: darkText });
      detailY -= 18;
    }

    // QR Code
    const qrPng = await QRCode.toBuffer(verifyUrl, { width: 160, margin: 0, color: { dark: "#111827", light: "#ffffff" }, errorCorrectionLevel: "M" });
    const qrImage = await pdfDoc.embedPng(qrPng);
    const qrY = detailsStartY - qrSize + 10;
    
    // QR border
    page.drawRectangle({ x: qrX - 5, y: qrY - 5, width: qrSize + 10, height: qrSize + 10, borderColor: borderGray, borderWidth: 1 });
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    
    const qrLabel = "SCAN TO VERIFY";
    const qrLabelWidth = helveticaBold.widthOfTextAtSize(qrLabel, 7);
    page.drawText(qrLabel, { x: qrX + (qrSize - qrLabelWidth) / 2, y: qrY - 12, size: 7, font: helveticaBold, color: darkGreen });

    y = Math.min(detailY, qrY - 20) - 10;

    // ══════════════════════════════════════════════════════════════════════
    // SHA-256 FINGERPRINT
    // ══════════════════════════════════════════════════════════════════════
    if (hash) {
      page.drawText("CRYPTOGRAPHIC FINGERPRINT (SHA-256)", { x: marginX, y, size: 8, font: helveticaBold, color: darkGreen });
      y -= 14;
      
      // Hash in a subtle box
      page.drawRectangle({ x: marginX, y: y - 8, width: contentWidth, height: 22, color: bgGray });
      page.drawText(hash, { x: marginX + 8, y: y - 2, size: 8, font: helvetica, color: darkText });
      y -= 30;
    }

    // Divider
    page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 0.5, color: borderGray });
    y -= 18;

    // ══════════════════════════════════════════════════════════════════════
    // WHAT THIS CERTIFICATE PROVES (Marketing + Legal)
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("WHAT THIS CERTIFICATE PROVES", { x: marginX, y, size: 9, font: helveticaBold, color: darkGreen });
    y -= 16;

    const legalText1 = "This certificate provides irrefutable evidence that the document named above existed in its exact form on the date and time recorded. A unique cryptographic fingerprint (SHA-256 hash) was computed and permanently anchored to the Bitcoin blockchain using the OpenTimestamps protocol.";
    const legal1Lines = wrapText(legalText1, helvetica, 9, contentWidth);
    for (const line of legal1Lines) {
      page.drawText(line, { x: marginX, y, size: 9, font: helvetica, color: darkText });
      y -= 13;
    }
    y -= 6;

    const legalText2 = "This proof is tamper-evident, independently verifiable, and will remain valid for as long as the Bitcoin network exists. No central authority can alter or revoke this timestamp.";
    const legal2Lines = wrapText(legalText2, helvetica, 9, contentWidth);
    for (const line of legal2Lines) {
      page.drawText(line, { x: marginX, y, size: 9, font: helvetica, color: darkText });
      y -= 13;
    }
    y -= 12;

    // ══════════════════════════════════════════════════════════════════════
    // WHY TIMESTAMPING MATTERS (Value proposition)
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("WHY BLOCKCHAIN TIMESTAMPING MATTERS", { x: marginX, y, size: 9, font: helveticaBold, color: darkGreen });
    y -= 16;

    const valueProps = [
      ["Intellectual Property", "Establish proof of creation for inventions, designs, and creative works before filing patents or copyrights."],
      ["Legal Protection", "Create admissible evidence for contracts, agreements, and disputes with court-recognized timestamps."],
      ["Business Records", "Maintain verifiable audit trails for compliance, due diligence, and regulatory requirements."],
      ["Personal Security", "Protect important documents like wills, property records, and personal agreements."],
    ];

    for (const [title, desc] of valueProps) {
      page.drawText("•  " + title + ":", { x: marginX, y, size: 8, font: helveticaBold, color: darkText });
      y -= 11;
      const descLines = wrapText(desc, helvetica, 8, contentWidth - 15);
      for (const line of descLines) {
        page.drawText(line, { x: marginX + 15, y, size: 8, font: helvetica, color: gray });
        y -= 10;
      }
      y -= 4;
    }

    // ══════════════════════════════════════════════════════════════════════
    // VERIFICATION INSTRUCTIONS
    // ══════════════════════════════════════════════════════════════════════
    y -= 5;
    page.drawText("VERIFY THIS PROOF", { x: marginX, y, size: 8, font: helveticaBold, color: darkGreen });
    y -= 12;
    
    const verifyText = "Scan the QR code or visit " + verifyUrl + " to independently verify this timestamp on the blockchain.";
    page.drawText(verifyText, { x: marginX, y, size: 8, font: helvetica, color: gray });

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════════════════
    const footerY = 45;
    
    // Footer line
    page.drawLine({ start: { x: marginX, y: footerY + 5 }, end: { x: width - marginX, y: footerY + 5 }, thickness: 1, color: green });
    
    // Footer text
    const footerLeft = "docuProof.io";
    const footerRight = "Trusted Blockchain Timestamping";
    page.drawText(footerLeft, { x: marginX, y: footerY - 8, size: 8, font: helveticaBold, color: darkGreen });
    const footerRightWidth = helvetica.widthOfTextAtSize(footerRight, 8);
    page.drawText(footerRight, { x: width - marginX - footerRightWidth, y: footerY - 8, size: 8, font: helvetica, color: gray });

    // ══════════════════════════════════════════════════════════════════════
    // DONE
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
        "x-docuproof-version": "proof_pdf v11.0.0",
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

// Text wrapping helper
function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", { weekday: 'long', year: "numeric", month: "long", day: "numeric" }) + 
           " at " + d.toLocaleTimeString("en-US", { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  } catch { return isoString; }
}
