// netlify/functions/proof_pdf.js
// v13.0.0 – Explains hash/proof ID relationship, improved spacing

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
    pdfDoc.setCreator("docuProof Certificate Generator v13.0.0");

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
    const highlightBg = hexToRgb("#f0fdf4");

    // Layout
    const marginX = 50;
    const contentWidth = width - marginX * 2;
    const centerX = width / 2;

    // ══════════════════════════════════════════════════════════════════════
    // DECORATIVE BORDER
    // ══════════════════════════════════════════════════════════════════════
    page.drawRectangle({ x: 25, y: 25, width: width - 50, height: height - 50, borderColor: green, borderWidth: 2 });
    page.drawRectangle({ x: 32, y: 32, width: width - 64, height: height - 64, borderColor: hexToRgb("#86efac"), borderWidth: 0.5 });

    const flourishSize = 20;
    const fo = 25;
    page.drawRectangle({ x: fo - 5, y: height - fo - flourishSize + 5, width: flourishSize, height: flourishSize, color: green });
    page.drawRectangle({ x: width - fo - flourishSize + 5, y: height - fo - flourishSize + 5, width: flourishSize, height: flourishSize, color: green });

    // ══════════════════════════════════════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════════════════════════════════════
    let y = height - 62;

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

    const logoSize = 32;
    const logoPadding = 5;
    const logoBoxSize = logoSize + logoPadding * 2;
    
    page.drawRectangle({ x: centerX - logoBoxSize / 2, y: y - logoBoxSize, width: logoBoxSize, height: logoBoxSize, color: logoBg });
    if (logoImage) {
      page.drawImage(logoImage, { x: centerX - logoSize / 2, y: y - logoBoxSize + logoPadding, width: logoSize, height: logoSize });
    }
    y -= logoBoxSize + 14;

    // Brand
    const brandText = "docuProof";
    const brandWidth = helveticaBold.widthOfTextAtSize(brandText, 20);
    page.drawText(brandText, { x: centerX - brandWidth / 2, y, size: 20, font: helveticaBold, color: green });
    y -= 12;

    const tagline = "Proof you can point to.";
    const taglineWidth = helveticaOblique.widthOfTextAtSize(tagline, 9);
    page.drawText(tagline, { x: centerX - taglineWidth / 2, y, size: 9, font: helveticaOblique, color: gray });
    y -= 18;

    // Title
    const titleLine1 = "CERTIFICATE OF";
    const titleLine1Width = helvetica.widthOfTextAtSize(titleLine1, 9);
    page.drawText(titleLine1, { x: centerX - titleLine1Width / 2, y, size: 9, font: helvetica, color: lightGray });
    y -= 22;

    const mainTitle = "PROOF OF EXISTENCE";
    const mainTitleWidth = helveticaBold.widthOfTextAtSize(mainTitle, 24);
    page.drawText(mainTitle, { x: centerX - mainTitleWidth / 2, y, size: 24, font: helveticaBold, color: black });
    y -= 11;

    const subtitle = "Immutable Blockchain Timestamp";
    const subtitleWidth = helvetica.widthOfTextAtSize(subtitle, 8);
    page.drawText(subtitle, { x: centerX - subtitleWidth / 2, y, size: 8, font: helvetica, color: gray });
    y -= 14;

    page.drawLine({ start: { x: centerX - 60, y }, end: { x: centerX + 60, y }, thickness: 1, color: green });
    y -= 14;

    // ══════════════════════════════════════════════════════════════════════
    // KEY CONCEPT BOX
    // ══════════════════════════════════════════════════════════════════════
    const conceptBoxHeight = 44;
    const conceptBoxY = y - conceptBoxHeight;
    
    page.drawRectangle({ x: marginX, y: conceptBoxY, width: contentWidth, height: conceptBoxHeight, color: highlightBg, borderColor: green, borderWidth: 1 });
    
    const keyConceptTitle = "HOW THIS PROOF WORKS";
    const keyConceptTitleWidth = helveticaBold.widthOfTextAtSize(keyConceptTitle, 8);
    page.drawText(keyConceptTitle, { x: centerX - keyConceptTitleWidth / 2, y: conceptBoxY + conceptBoxHeight - 12, size: 8, font: helveticaBold, color: darkGreen });
    
    const keyLine1 = "This certificate is linked to a specific file. To prove the file existed on this date, you need BOTH:";
    const keyLine1Width = helvetica.widthOfTextAtSize(keyLine1, 7.5);
    page.drawText(keyLine1, { x: centerX - keyLine1Width / 2, y: conceptBoxY + conceptBoxHeight - 24, size: 7.5, font: helvetica, color: darkText });
    
    const keyLine2 = "Your Original File  +  This Certificate  =  Verified Proof";
    const keyLine2Width = helveticaBold.widthOfTextAtSize(keyLine2, 9);
    page.drawText(keyLine2, { x: centerX - keyLine2Width / 2, y: conceptBoxY + 8, size: 9, font: helveticaBold, color: darkGreen });
    
    y = conceptBoxY - 16;

    // ══════════════════════════════════════════════════════════════════════
    // DOCUMENT DETAILS + QR CODE
    // ══════════════════════════════════════════════════════════════════════
    const qrSize = 68;
    const qrX = width - marginX - qrSize - 6;

    const blockDisplay = blockHeight ? `Bitcoin Block #${blockHeight}` : "Pending confirmation";
    const details = [
      ["YOUR FILE", display],
      ["DATE & TIME", formatDate(createdAt)],
      ["BLOCKCHAIN RECORD", blockDisplay],
    ];

    let detailY = y;
    for (const [label, value] of details) {
      page.drawText(label, { x: marginX, y: detailY, size: 7, font: helveticaBold, color: darkGreen });
      detailY -= 12;
      page.drawText(value, { x: marginX, y: detailY, size: 10, font: helvetica, color: darkText });
      detailY -= 18;
    }

    // QR Code
    const qrPng = await QRCode.toBuffer(verifyUrl, { width: 136, margin: 0, color: { dark: "#111827", light: "#ffffff" }, errorCorrectionLevel: "M" });
    const qrImage = await pdfDoc.embedPng(qrPng);
    const qrY = y - qrSize + 6;
    
    page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrSize + 8, height: qrSize + 8, borderColor: borderGray, borderWidth: 1 });
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    
    const qrLabel = "SCAN TO VERIFY";
    const qrLabelWidth = helveticaBold.widthOfTextAtSize(qrLabel, 6);
    page.drawText(qrLabel, { x: qrX + (qrSize - qrLabelWidth) / 2, y: qrY - 10, size: 6, font: helveticaBold, color: darkGreen });

    y = detailY - 8;

    // ══════════════════════════════════════════════════════════════════════
    // UNDERSTANDING THE IDENTIFIERS
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("UNDERSTANDING YOUR PROOF", { x: marginX, y, size: 8, font: helveticaBold, color: darkGreen });
    y -= 14;

    // Proof ID explanation
    page.drawText("Proof ID:", { x: marginX, y, size: 8, font: helveticaBold, color: darkText });
    page.drawText("  " + id, { x: marginX + 50, y, size: 8, font: helvetica, color: darkText });
    y -= 11;
    const proofIdExplain = "Your unique reference number for this timestamp. Use this to look up your proof on docuProof.io.";
    page.drawText(proofIdExplain, { x: marginX, y, size: 7, font: helveticaOblique, color: gray });
    y -= 16;

    // File Fingerprint explanation
    if (hash) {
      page.drawText("File Fingerprint (SHA-256 Hash):", { x: marginX, y, size: 8, font: helveticaBold, color: darkText });
      y -= 11;
      page.drawRectangle({ x: marginX, y: y - 4, width: contentWidth, height: 16, color: bgGray });
      page.drawText(hash, { x: marginX + 6, y: y, size: 6.5, font: helvetica, color: darkText });
      y -= 18;
      
      const hashExplain = "This is a unique \"digital fingerprint\" calculated from your exact file. If even one tiny bit of your file changes, the fingerprint would be completely different. This fingerprint—not the file itself—is what's recorded on the blockchain. That's why you need your original file to verify: we recalculate its fingerprint and check if it matches.";
      const hashLines = wrapText(hashExplain, helvetica, 7, contentWidth);
      for (const line of hashLines) {
        page.drawText(line, { x: marginX, y, size: 7, font: helveticaOblique, color: gray });
        y -= 10;
      }
    }
    y -= 10;

    // Divider
    page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 0.5, color: borderGray });
    y -= 16;

    // ══════════════════════════════════════════════════════════════════════
    // WHY THIS MATTERS
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("WHY BLOCKCHAIN TIMESTAMPING MATTERS", { x: marginX, y, size: 8, font: helveticaBold, color: darkGreen });
    y -= 14;

    const whyText = "Traditional timestamps can be faked or altered. Blockchain timestamps cannot. Once recorded, your proof exists permanently on a decentralized network maintained by thousands of computers worldwide. No single person, company, or government can change or delete it.";
    const whyLines = wrapText(whyText, helvetica, 8, contentWidth);
    for (const line of whyLines) {
      page.drawText(line, { x: marginX, y, size: 8, font: helvetica, color: darkText });
      y -= 12;
    }
    y -= 10;

    // Use cases - more compact, single line each
    const useCases = [
      "• Intellectual Property — Prove when you created original work before filing patents or copyrights",
      "• Legal Evidence — Establish document authenticity for contracts, agreements, and disputes",
      "• Business Records — Maintain verifiable audit trails for compliance and regulations",
      "• Personal Protection — Secure important documents like wills and property records",
    ];

    for (const useCase of useCases) {
      page.drawText(useCase, { x: marginX, y, size: 7, font: helvetica, color: darkText });
      y -= 12;
    }
    y -= 12;

    // ══════════════════════════════════════════════════════════════════════
    // HOW TO VERIFY
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("HOW TO VERIFY YOUR PROOF", { x: marginX, y, size: 8, font: helveticaBold, color: darkGreen });
    y -= 14;
    
    const verifySteps = [
      "1. Keep your original file safe — without it, you cannot verify your proof",
      "2. Visit docuProof.io/v/" + id + " or scan the QR code",
      "3. Upload your original file — we'll calculate its fingerprint",
      "4. If the fingerprint matches, your proof is verified on the blockchain",
    ];
    
    for (const step of verifySteps) {
      page.drawText(step, { x: marginX, y, size: 7.5, font: helvetica, color: darkText });
      y -= 12;
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
        "x-docuproof-version": "proof_pdf v13.0.0",
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
