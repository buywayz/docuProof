// netlify/functions/proof_pdf.js
// v15.0.0 – Calculated uniform layout

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
    pdfDoc.setCreator("docuProof Certificate Generator v15.0.0");

    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Colors
    const green = hexToRgb("#22c55e");
    const darkGreen = hexToRgb("#15803d");
    const black = hexToRgb("#111827");
    const gray = hexToRgb("#6b7280");
    const borderGray = hexToRgb("#e5e7eb");
    const bgGray = hexToRgb("#f3f4f6");
    const logoBg = hexToRgb("#0f172a");
    const highlightBg = hexToRgb("#ecfdf5");
    const conceptBg = hexToRgb("#f0fdf4");

    // FIXED LAYOUT ZONES (top to bottom)
    const marginX = 50;
    const contentWidth = width - marginX * 2;
    const centerX = width / 2;
    
    const TOP_MARGIN = 45;
    const BOTTOM_MARGIN = 45;
    const FOOTER_HEIGHT = 25;
    
    // ══════════════════════════════════════════════════════════════════════
    // BORDER
    // ══════════════════════════════════════════════════════════════════════
    page.drawRectangle({ x: 22, y: 22, width: width - 44, height: height - 44, borderColor: green, borderWidth: 2.5 });
    
    // Corner accents
    const cs = 20;
    page.drawRectangle({ x: 18, y: height - 18 - cs, width: cs, height: cs, color: green });
    page.drawRectangle({ x: width - 18 - cs, y: height - 18 - cs, width: cs, height: cs, color: green });

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 1: HEADER (logo + title) - Top 120px
    // ══════════════════════════════════════════════════════════════════════
    let y = height - TOP_MARGIN;

    // Logo
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
    const logoPad = 4;
    const logoBoxSize = logoSize + logoPad * 2;
    
    page.drawRectangle({ x: centerX - logoBoxSize / 2, y: y - logoBoxSize, width: logoBoxSize, height: logoBoxSize, color: logoBg });
    if (logoImage) {
      page.drawImage(logoImage, { x: centerX - logoSize / 2, y: y - logoBoxSize + logoPad, width: logoSize, height: logoSize });
    }
    y -= logoBoxSize + 20;

    // Title
    page.drawText("CERTIFICATE OF", { x: centerX - helvetica.widthOfTextAtSize("CERTIFICATE OF", 11) / 2, y, size: 11, font: helvetica, color: gray });
    y -= 30;

    page.drawText("PROOF OF EXISTENCE", { x: centerX - helveticaBold.widthOfTextAtSize("PROOF OF EXISTENCE", 28) / 2, y, size: 28, font: helveticaBold, color: black });
    y -= 18;

    page.drawText("Immutable Blockchain Timestamp", { x: centerX - helvetica.widthOfTextAtSize("Immutable Blockchain Timestamp", 10) / 2, y, size: 10, font: helvetica, color: gray });
    y -= 20;

    page.drawLine({ start: { x: centerX - 80, y }, end: { x: centerX + 80, y }, thickness: 2, color: green });
    y -= 25;

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 2: KEY CONCEPT BOX - 55px
    // ══════════════════════════════════════════════════════════════════════
    const conceptH = 55;
    const conceptY = y - conceptH;
    
    page.drawRectangle({ x: marginX, y: conceptY, width: contentWidth, height: conceptH, color: conceptBg, borderColor: green, borderWidth: 1 });
    
    page.drawText("HOW THIS PROOF WORKS", { x: centerX - helveticaBold.widthOfTextAtSize("HOW THIS PROOF WORKS", 11) / 2, y: conceptY + conceptH - 18, size: 11, font: helveticaBold, color: darkGreen });
    
    const conceptLine = "This certificate is linked to your file. To prove it existed on this date, you need BOTH:";
    page.drawText(conceptLine, { x: centerX - helvetica.widthOfTextAtSize(conceptLine, 10) / 2, y: conceptY + conceptH - 34, size: 10, font: helvetica, color: black });
    
    const conceptFormula = "Your Original File  +  This Certificate  =  Verified Proof";
    page.drawText(conceptFormula, { x: centerX - helveticaBold.widthOfTextAtSize(conceptFormula, 12) / 2, y: conceptY + 10, size: 12, font: helveticaBold, color: darkGreen });
    
    y = conceptY - 25;

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 3: DOCUMENT DETAILS + QR - 140px
    // ══════════════════════════════════════════════════════════════════════
    const qrSize = 85;
    const qrX = width - marginX - qrSize;
    const qrY = y - qrSize - 10;
    
    // QR Code
    const qrPng = await QRCode.toBuffer(verifyUrl, { width: 170, margin: 0, color: { dark: "#111827", light: "#ffffff" }, errorCorrectionLevel: "M" });
    const qrImage = await pdfDoc.embedPng(qrPng);
    page.drawRectangle({ x: qrX - 5, y: qrY - 5, width: qrSize + 10, height: qrSize + 10, borderColor: borderGray, borderWidth: 1 });
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    page.drawText("SCAN TO VERIFY", { x: qrX + (qrSize - helveticaBold.widthOfTextAtSize("SCAN TO VERIFY", 8)) / 2, y: qrY - 15, size: 8, font: helveticaBold, color: darkGreen });

    // Details - left side
    const detailsWidth = qrX - marginX - 30;
    const blockDisplay = blockHeight ? `Bitcoin Block #${blockHeight}` : "Pending confirmation";
    
    const details = [
      ["PROOF ID", id, true],
      ["TIMESTAMPED FILE", display, true],
      ["DATE & TIME", formatDate(createdAt), false],
      ["BLOCKCHAIN RECORD", blockDisplay, false],
    ];

    let detailY = y;
    for (const [label, value, highlight] of details) {
      if (highlight) {
        page.drawRectangle({ x: marginX - 5, y: detailY - 8, width: detailsWidth + 10, height: 32, color: highlightBg });
      }
      page.drawText(label, { x: marginX, y: detailY + 8, size: 10, font: helveticaBold, color: darkGreen });
      page.drawText(value, { x: marginX, y: detailY - 8, size: 12, font: helveticaBold, color: black });
      detailY -= 38;
    }

    y = Math.min(detailY, qrY - 20) - 10;

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 4: FILE FINGERPRINT - 50px
    // ══════════════════════════════════════════════════════════════════════
    if (hash) {
      page.drawText("FILE FINGERPRINT (SHA-256 HASH)", { x: marginX, y, size: 10, font: helveticaBold, color: darkGreen });
      y -= 20;
      
      page.drawRectangle({ x: marginX, y: y - 5, width: contentWidth, height: 24, color: bgGray, borderColor: borderGray, borderWidth: 0.5 });
      page.drawText(hash, { x: marginX + 10, y: y + 2, size: 9, font: helvetica, color: black });
      y -= 35;
    }

    // Divider
    page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 1, color: borderGray });
    y -= 25;

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 5: UNDERSTANDING + WHY IT MATTERS - ~180px
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("UNDERSTANDING YOUR PROOF", { x: marginX, y, size: 11, font: helveticaBold, color: darkGreen });
    y -= 18;

    const understandText = "Your Proof ID is your unique lookup reference on docuProof.io. The File Fingerprint is a unique code calculated from your exact file. If even one bit of your file changes, the fingerprint changes completely. This fingerprint—not your file—is what's recorded on the blockchain. To verify your proof, we recalculate your file's fingerprint and confirm it matches the blockchain record.";
    const understandLines = wrapText(understandText, helvetica, 10, contentWidth);
    for (const line of understandLines) {
      page.drawText(line, { x: marginX, y, size: 10, font: helvetica, color: black });
      y -= 15;
    }
    y -= 15;

    page.drawText("WHY BLOCKCHAIN TIMESTAMPING MATTERS", { x: marginX, y, size: 11, font: helveticaBold, color: darkGreen });
    y -= 18;

    const whyText = "Traditional timestamps can be faked. Blockchain timestamps cannot. Your proof exists permanently on a decentralized network maintained by thousands of computers. No person, company, or government can alter or delete it.";
    const whyLines = wrapText(whyText, helvetica, 10, contentWidth);
    for (const line of whyLines) {
      page.drawText(line, { x: marginX, y, size: 10, font: helvetica, color: black });
      y -= 15;
    }
    y -= 10;

    const useCases = [
      "•  Intellectual Property — Prove when you created original work",
      "•  Legal Evidence — Establish document authenticity for disputes",
      "•  Business Records — Maintain verifiable audit trails for compliance",
      "•  Personal Protection — Secure wills, contracts, and property records",
    ];

    for (const uc of useCases) {
      page.drawText(uc, { x: marginX, y, size: 10, font: helvetica, color: black });
      y -= 16;
    }
    y -= 15;

    // ══════════════════════════════════════════════════════════════════════
    // SECTION 6: HOW TO VERIFY - ~70px
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("HOW TO VERIFY YOUR PROOF", { x: marginX, y, size: 11, font: helveticaBold, color: darkGreen });
    y -= 18;
    
    const steps = [
      "1.  Keep your original file safe — without it, you cannot verify your proof",
      "2.  Visit docuProof.io/v/" + id + " or scan the QR code",
      "3.  Upload your original file — we'll calculate its fingerprint",
      "4.  If the fingerprint matches, your proof is verified on the blockchain",
    ];
    
    for (const step of steps) {
      page.drawText(step, { x: marginX, y, size: 10, font: helvetica, color: black });
      y -= 16;
    }

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER - Fixed at bottom
    // ══════════════════════════════════════════════════════════════════════
    const footerLineY = BOTTOM_MARGIN + FOOTER_HEIGHT;
    page.drawLine({ start: { x: marginX, y: footerLineY }, end: { x: width - marginX, y: footerLineY }, thickness: 2, color: green });
    
    page.drawText("docuProof.io", { x: marginX, y: BOTTOM_MARGIN + 5, size: 10, font: helveticaBold, color: darkGreen });
    const footerRight = "Trusted Blockchain Timestamping";
    page.drawText(footerRight, { x: width - marginX - helvetica.widthOfTextAtSize(footerRight, 10), y: BOTTOM_MARGIN + 5, size: 10, font: helvetica, color: gray });

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
        "x-docuproof-version": "proof_pdf v15.0.0",
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
