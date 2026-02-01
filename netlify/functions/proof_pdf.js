// netlify/functions/proof_pdf.js
// v12.0.0 – Clear explanation of file + timestamp = proof

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
    pdfDoc.setCreator("docuProof Certificate Generator v12.0.0");

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
    const highlightBg = hexToRgb("#f0fdf4"); // Light green background

    // Layout constants
    const marginX = 50;
    const contentWidth = width - marginX * 2;
    const centerX = width / 2;

    // ══════════════════════════════════════════════════════════════════════
    // DECORATIVE BORDER
    // ══════════════════════════════════════════════════════════════════════
    page.drawRectangle({ x: 25, y: 25, width: width - 50, height: height - 50, borderColor: green, borderWidth: 2 });
    page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: hexToRgb("#86efac"), borderWidth: 0.5 });

    // Corner flourishes
    const flourishSize = 20;
    const fo = 25;
    page.drawRectangle({ x: fo - 5, y: height - fo - flourishSize + 5, width: flourishSize, height: flourishSize, color: green });
    page.drawRectangle({ x: width - fo - flourishSize + 5, y: height - fo - flourishSize + 5, width: flourishSize, height: flourishSize, color: green });

    // ══════════════════════════════════════════════════════════════════════
    // HEADER SECTION
    // ══════════════════════════════════════════════════════════════════════
    let y = height - 65;

    // Logo - properly sized with adequate spacing below
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

    const logoSize = 36;
    const logoPadding = 5;
    const logoBoxSize = logoSize + logoPadding * 2;
    
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
    y -= logoBoxSize + 18; // MORE SPACE after logo

    // Brand name
    const brandText = "docuProof";
    const brandWidth = helveticaBold.widthOfTextAtSize(brandText, 22);
    page.drawText(brandText, { x: centerX - brandWidth / 2, y, size: 22, font: helveticaBold, color: green });
    y -= 14;

    // Tagline
    const tagline = "Proof you can point to.";
    const taglineWidth = helveticaOblique.widthOfTextAtSize(tagline, 9);
    page.drawText(tagline, { x: centerX - taglineWidth / 2, y, size: 9, font: helveticaOblique, color: gray });
    y -= 22;

    // Certificate title
    const titleLine1 = "CERTIFICATE OF";
    const titleLine1Width = helvetica.widthOfTextAtSize(titleLine1, 10);
    page.drawText(titleLine1, { x: centerX - titleLine1Width / 2, y, size: 10, font: helvetica, color: lightGray });
    y -= 26;

    const mainTitle = "PROOF OF EXISTENCE";
    const mainTitleWidth = helveticaBold.widthOfTextAtSize(mainTitle, 26);
    page.drawText(mainTitle, { x: centerX - mainTitleWidth / 2, y, size: 26, font: helveticaBold, color: black });
    y -= 12;

    const subtitle = "Immutable Blockchain Timestamp";
    const subtitleWidth = helvetica.widthOfTextAtSize(subtitle, 8);
    page.drawText(subtitle, { x: centerX - subtitleWidth / 2, y, size: 8, font: helvetica, color: gray });
    y -= 18;

    // Decorative divider
    page.drawLine({ start: { x: centerX - 70, y }, end: { x: centerX + 70, y }, thickness: 1, color: green });
    y -= 16;

    // ══════════════════════════════════════════════════════════════════════
    // KEY CONCEPT BOX - The most important thing to understand
    // ══════════════════════════════════════════════════════════════════════
    const conceptBoxHeight = 48;
    const conceptBoxY = y - conceptBoxHeight;
    
    page.drawRectangle({ x: marginX, y: conceptBoxY, width: contentWidth, height: conceptBoxHeight, color: highlightBg, borderColor: green, borderWidth: 1 });
    
    const keyConceptTitle = "HOW THIS PROOF WORKS";
    const keyConceptTitleWidth = helveticaBold.widthOfTextAtSize(keyConceptTitle, 9);
    page.drawText(keyConceptTitle, { x: centerX - keyConceptTitleWidth / 2, y: conceptBoxY + conceptBoxHeight - 14, size: 9, font: helveticaBold, color: darkGreen });
    
    const keyLine1 = "This certificate is linked to a specific file. To prove the file existed on this date, you need BOTH:";
    const keyLine1Width = helvetica.widthOfTextAtSize(keyLine1, 8);
    page.drawText(keyLine1, { x: centerX - keyLine1Width / 2, y: conceptBoxY + conceptBoxHeight - 28, size: 8, font: helvetica, color: darkText });
    
    const keyLine2 = "Your Original File  +  This Timestamp Certificate  =  Verified Proof of Existence";
    const keyLine2Width = helveticaBold.widthOfTextAtSize(keyLine2, 9);
    page.drawText(keyLine2, { x: centerX - keyLine2Width / 2, y: conceptBoxY + 8, size: 9, font: helveticaBold, color: darkGreen });
    
    y = conceptBoxY - 14;

    // ══════════════════════════════════════════════════════════════════════
    // DOCUMENT DETAILS + QR CODE
    // ══════════════════════════════════════════════════════════════════════
    const qrSize = 72;
    const qrX = width - marginX - qrSize - 8;

    const blockDisplay = blockHeight ? `Bitcoin Block #${blockHeight}` : "Pending confirmation";
    const details = [
      ["PROOF ID", id],
      ["TIMESTAMPED FILE", display],
      ["DATE & TIME", formatDate(createdAt)],
      ["BLOCKCHAIN ANCHOR", blockDisplay],
    ];

    let detailY = y;
    for (const [label, value] of details) {
      page.drawText(label, { x: marginX, y: detailY, size: 7, font: helveticaBold, color: darkGreen });
      detailY -= 11;
      page.drawText(value, { x: marginX, y: detailY, size: 10, font: helvetica, color: darkText });
      detailY -= 16;
    }

    // QR Code
    const qrPng = await QRCode.toBuffer(verifyUrl, { width: 144, margin: 0, color: { dark: "#111827", light: "#ffffff" }, errorCorrectionLevel: "M" });
    const qrImage = await pdfDoc.embedPng(qrPng);
    const qrY = y - qrSize + 8;
    
    page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrSize + 8, height: qrSize + 8, borderColor: borderGray, borderWidth: 1 });
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    
    const qrLabel = "SCAN TO VERIFY";
    const qrLabelWidth = helveticaBold.widthOfTextAtSize(qrLabel, 6);
    page.drawText(qrLabel, { x: qrX + (qrSize - qrLabelWidth) / 2, y: qrY - 10, size: 6, font: helveticaBold, color: darkGreen });

    y = Math.min(detailY, qrY - 16) - 6;

    // ══════════════════════════════════════════════════════════════════════
    // SHA-256 FINGERPRINT
    // ══════════════════════════════════════════════════════════════════════
    if (hash) {
      page.drawText("FILE FINGERPRINT (SHA-256 HASH)", { x: marginX, y, size: 7, font: helveticaBold, color: darkGreen });
      y -= 12;
      page.drawRectangle({ x: marginX, y: y - 6, width: contentWidth, height: 18, color: bgGray });
      page.drawText(hash, { x: marginX + 6, y: y, size: 7, font: helvetica, color: darkText });
      y -= 22;
    }

    // Divider
    page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 0.5, color: borderGray });
    y -= 14;

    // ══════════════════════════════════════════════════════════════════════
    // SIMPLE EXPLANATION
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("WHAT THIS MEANS", { x: marginX, y, size: 8, font: helveticaBold, color: darkGreen });
    y -= 13;

    const simpleExplain = "When you timestamped your file, we created a unique digital fingerprint (like a one-of-a-kind ID number) from it. This fingerprint was then recorded on the Bitcoin blockchain—a permanent, tamper-proof public ledger that no one can change or delete. If anyone ever questions when your file existed, you can prove it by showing that the fingerprint of your file matches this recorded timestamp.";
    const simpleLines = wrapText(simpleExplain, helvetica, 8, contentWidth);
    for (const line of simpleLines) {
      page.drawText(line, { x: marginX, y, size: 8, font: helvetica, color: darkText });
      y -= 11;
    }
    y -= 8;

    // ══════════════════════════════════════════════════════════════════════
    // WHY THIS MATTERS
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("WHY BLOCKCHAIN TIMESTAMPING MATTERS", { x: marginX, y, size: 8, font: helveticaBold, color: darkGreen });
    y -= 12;

    const valueProps = [
      ["Intellectual Property:", "Prove when you created inventions, designs, or creative works."],
      ["Legal Evidence:", "Establish document authenticity for contracts and disputes."],
      ["Business Compliance:", "Maintain verifiable audit trails for regulatory requirements."],
      ["Personal Protection:", "Secure wills, property records, and important agreements."],
    ];

    for (const [title, desc] of valueProps) {
      page.drawText("•  " + title, { x: marginX, y, size: 7, font: helveticaBold, color: darkText });
      const titleWidth = helveticaBold.widthOfTextAtSize("•  " + title, 7);
      page.drawText(" " + desc, { x: marginX + titleWidth, y, size: 7, font: helvetica, color: gray });
      y -= 12;
    }
    y -= 6;

    // ══════════════════════════════════════════════════════════════════════
    // HOW TO VERIFY
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("HOW TO VERIFY", { x: marginX, y, size: 8, font: helveticaBold, color: darkGreen });
    y -= 12;
    
    const verifySteps = [
      "1. Keep your original file safe—you'll need it to verify.",
      "2. Scan the QR code or visit the verification URL.",
      "3. Upload your original file to confirm the fingerprint matches.",
      "4. The blockchain record proves your file existed on this date."
    ];
    
    for (const step of verifySteps) {
      page.drawText(step, { x: marginX, y, size: 7, font: helvetica, color: darkText });
      y -= 10;
    }

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════════════════
    const footerY = 42;
    page.drawLine({ start: { x: marginX, y: footerY + 5 }, end: { x: width - marginX, y: footerY + 5 }, thickness: 1, color: green });
    
    page.drawText("docuProof.io", { x: marginX, y: footerY - 8, size: 8, font: helveticaBold, color: darkGreen });
    const footerRight = "Trusted Blockchain Timestamping";
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
        "x-docuproof-version": "proof_pdf v12.0.0",
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
