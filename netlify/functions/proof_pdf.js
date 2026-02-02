// netlify/functions/proof_pdf.js
// v14.1.0 – Fixed footer overlap

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
    pdfDoc.setCreator("docuProof Certificate Generator v14.1.0");

    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();

    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // Colors
    const green = hexToRgb("#22c55e");
    const darkGreen = hexToRgb("#15803d");
    const black = hexToRgb("#111827");
    const gray = hexToRgb("#6b7280");
    const lightGray = hexToRgb("#9ca3af");
    const borderGray = hexToRgb("#e5e7eb");
    const bgGray = hexToRgb("#f3f4f6");
    const logoBg = hexToRgb("#0f172a");
    const highlightBg = hexToRgb("#ecfdf5");
    const conceptBg = hexToRgb("#f0fdf4");

    // Layout
    const marginX = 55;
    const contentWidth = width - marginX * 2;
    const centerX = width / 2;
    const footerY = 50; // Footer position - content must stay above this

    // CONSISTENT FONT SIZES
    const SIZE_TITLE = 24;
    const SIZE_SECTION_HEADER = 9;
    const SIZE_LABEL = 8;
    const SIZE_VALUE = 10;
    const SIZE_BODY = 8;

    // ══════════════════════════════════════════════════════════════════════
    // DECORATIVE BORDER
    // ══════════════════════════════════════════════════════════════════════
    page.drawRectangle({ x: 25, y: 25, width: width - 50, height: height - 50, borderColor: green, borderWidth: 2 });
    page.drawRectangle({ x: 31, y: 31, width: width - 62, height: height - 62, borderColor: hexToRgb("#86efac"), borderWidth: 0.5 });

    // Corner accents
    const cs = 18;
    page.drawRectangle({ x: 20, y: height - 20 - cs, width: cs, height: cs, color: green });
    page.drawRectangle({ x: width - 20 - cs, y: height - 20 - cs, width: cs, height: cs, color: green });

    // ══════════════════════════════════════════════════════════════════════
    // HEADER
    // ══════════════════════════════════════════════════════════════════════
    let y = height - 55;

    // Logo with MINIMAL padding
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
    const logoPadding = 3;
    const logoBoxSize = logoSize + logoPadding * 2;
    
    page.drawRectangle({ x: centerX - logoBoxSize / 2, y: y - logoBoxSize, width: logoBoxSize, height: logoBoxSize, color: logoBg });
    if (logoImage) {
      page.drawImage(logoImage, { x: centerX - logoSize / 2, y: y - logoBoxSize + logoPadding, width: logoSize, height: logoSize });
    }
    y -= logoBoxSize + 14;

    // Title
    const titleLine1 = "CERTIFICATE OF";
    page.drawText(titleLine1, { x: centerX - helvetica.widthOfTextAtSize(titleLine1, SIZE_LABEL) / 2, y, size: SIZE_LABEL, font: helvetica, color: lightGray });
    y -= 24;

    const mainTitle = "PROOF OF EXISTENCE";
    page.drawText(mainTitle, { x: centerX - helveticaBold.widthOfTextAtSize(mainTitle, SIZE_TITLE) / 2, y, size: SIZE_TITLE, font: helveticaBold, color: black });
    y -= 12;

    const subtitle = "Immutable Blockchain Timestamp";
    page.drawText(subtitle, { x: centerX - helvetica.widthOfTextAtSize(subtitle, 7) / 2, y, size: 7, font: helvetica, color: gray });
    y -= 14;

    page.drawLine({ start: { x: centerX - 60, y }, end: { x: centerX + 60, y }, thickness: 1.5, color: green });
    y -= 16;

    // ══════════════════════════════════════════════════════════════════════
    // KEY CONCEPT BOX
    // ══════════════════════════════════════════════════════════════════════
    const conceptBoxHeight = 44;
    const conceptBoxY = y - conceptBoxHeight;
    
    page.drawRectangle({ x: marginX, y: conceptBoxY, width: contentWidth, height: conceptBoxHeight, color: conceptBg, borderColor: green, borderWidth: 1 });
    
    page.drawText("HOW THIS PROOF WORKS", { x: centerX - helveticaBold.widthOfTextAtSize("HOW THIS PROOF WORKS", SIZE_SECTION_HEADER) / 2, y: conceptBoxY + conceptBoxHeight - 13, size: SIZE_SECTION_HEADER, font: helveticaBold, color: darkGreen });
    
    const keyLine1 = "This certificate is linked to a specific file. To prove the file existed on this date, you need BOTH:";
    page.drawText(keyLine1, { x: centerX - helvetica.widthOfTextAtSize(keyLine1, 7) / 2, y: conceptBoxY + conceptBoxHeight - 26, size: 7, font: helvetica, color: black });
    
    const keyLine2 = "Your Original File  +  This Certificate  =  Verified Proof";
    page.drawText(keyLine2, { x: centerX - helveticaBold.widthOfTextAtSize(keyLine2, SIZE_VALUE) / 2, y: conceptBoxY + 9, size: SIZE_VALUE, font: helveticaBold, color: darkGreen });
    
    y = conceptBoxY - 18;

    // ══════════════════════════════════════════════════════════════════════
    // DOCUMENT DETAILS
    // ══════════════════════════════════════════════════════════════════════
    const qrSize = 70;
    const qrX = width - marginX - qrSize - 8;
    const detailsWidth = qrX - marginX - 20;

    const blockDisplay = blockHeight ? `Bitcoin Block #${blockHeight}` : "Pending confirmation";

    const drawDetail = (label, value, yPos, highlight = false) => {
      if (highlight) {
        page.drawRectangle({ x: marginX - 4, y: yPos - 5, width: detailsWidth + 8, height: 26, color: highlightBg });
      }
      page.drawText(label, { x: marginX, y: yPos + 9, size: SIZE_LABEL, font: helveticaBold, color: darkGreen });
      page.drawText(value, { x: marginX, y: yPos - 4, size: SIZE_VALUE, font: helveticaBold, color: black });
      return yPos - 30;
    };

    y = drawDetail("PROOF ID", id, y, true);
    y = drawDetail("TIMESTAMPED FILE", display, y, true);
    y = drawDetail("DATE & TIME", formatDate(createdAt), y, false);
    y = drawDetail("BLOCKCHAIN RECORD", blockDisplay, y, false);

    // QR Code
    const qrPng = await QRCode.toBuffer(verifyUrl, { width: 140, margin: 0, color: { dark: "#111827", light: "#ffffff" }, errorCorrectionLevel: "M" });
    const qrImage = await pdfDoc.embedPng(qrPng);
    const qrY = conceptBoxY - qrSize - 25;
    
    page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrSize + 8, height: qrSize + 8, borderColor: borderGray, borderWidth: 1 });
    page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    page.drawText("SCAN TO VERIFY", { x: qrX + (qrSize - helveticaBold.widthOfTextAtSize("SCAN TO VERIFY", 6)) / 2, y: qrY - 12, size: 6, font: helveticaBold, color: darkGreen });

    y -= 6;

    // ══════════════════════════════════════════════════════════════════════
    // FILE FINGERPRINT
    // ══════════════════════════════════════════════════════════════════════
    if (hash) {
      page.drawText("FILE FINGERPRINT (SHA-256 HASH)", { x: marginX, y, size: SIZE_LABEL, font: helveticaBold, color: darkGreen });
      y -= 14;
      
      page.drawRectangle({ x: marginX, y: y - 2, width: contentWidth, height: 16, color: bgGray, borderColor: borderGray, borderWidth: 0.5 });
      page.drawText(hash, { x: marginX + 6, y: y + 2, size: 6.5, font: helvetica, color: black });
      y -= 22;
    }

    // Divider
    page.drawLine({ start: { x: marginX, y }, end: { x: width - marginX, y }, thickness: 0.5, color: borderGray });
    y -= 16;

    // ══════════════════════════════════════════════════════════════════════
    // UNDERSTANDING YOUR PROOF
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("UNDERSTANDING YOUR PROOF", { x: marginX, y, size: SIZE_SECTION_HEADER, font: helveticaBold, color: darkGreen });
    y -= 14;

    const proofExplain = "The Proof ID is your unique reference to look up this timestamp on docuProof.io. The File Fingerprint is a unique code calculated from your exact file—if even one bit changes, the fingerprint would be completely different. This fingerprint (not your actual file) is recorded on the Bitcoin blockchain. To verify, we recalculate your file's fingerprint and confirm it matches.";
    const proofLines = wrapText(proofExplain, helvetica, SIZE_BODY, contentWidth);
    for (const line of proofLines) {
      page.drawText(line, { x: marginX, y, size: SIZE_BODY, font: helvetica, color: black });
      y -= 11;
    }
    y -= 6;

    // ══════════════════════════════════════════════════════════════════════
    // WHY BLOCKCHAIN TIMESTAMPING MATTERS
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("WHY BLOCKCHAIN TIMESTAMPING MATTERS", { x: marginX, y, size: SIZE_SECTION_HEADER, font: helveticaBold, color: darkGreen });
    y -= 14;

    const whyText = "Traditional timestamps can be faked. Blockchain timestamps cannot. Your proof exists permanently on a decentralized network. No person, company, or government can change or delete it.";
    const whyLines = wrapText(whyText, helvetica, SIZE_BODY, contentWidth);
    for (const line of whyLines) {
      page.drawText(line, { x: marginX, y, size: SIZE_BODY, font: helvetica, color: black });
      y -= 11;
    }
    y -= 8;

    const useCases = [
      "• Intellectual Property — Prove when you created original work",
      "• Legal Evidence — Establish document authenticity for disputes",
      "• Business Records — Maintain verifiable audit trails",
      "• Personal Protection — Secure wills and property records",
    ];

    for (const useCase of useCases) {
      page.drawText(useCase, { x: marginX, y, size: SIZE_BODY, font: helvetica, color: black });
      y -= 12;
    }
    y -= 8;

    // ══════════════════════════════════════════════════════════════════════
    // HOW TO VERIFY YOUR PROOF
    // ══════════════════════════════════════════════════════════════════════
    page.drawText("HOW TO VERIFY YOUR PROOF", { x: marginX, y, size: SIZE_SECTION_HEADER, font: helveticaBold, color: darkGreen });
    y -= 14;
    
    const verifySteps = [
      "1. Keep your original file safe — without it, you cannot verify",
      "2. Visit docuProof.io/v/" + id + " or scan the QR code",
      "3. Upload your file — we'll calculate its fingerprint",
      "4. If it matches, your proof is verified on the blockchain",
    ];
    
    for (const step of verifySteps) {
      page.drawText(step, { x: marginX, y, size: SIZE_BODY, font: helvetica, color: black });
      y -= 12;
    }

    // ══════════════════════════════════════════════════════════════════════
    // FOOTER - Fixed position at bottom
    // ══════════════════════════════════════════════════════════════════════
    page.drawLine({ start: { x: marginX, y: footerY + 8 }, end: { x: width - marginX, y: footerY + 8 }, thickness: 1.5, color: green });
    
    page.drawText("docuProof.io", { x: marginX, y: footerY - 4, size: SIZE_BODY, font: helveticaBold, color: darkGreen });
    const footerRight = "Trusted Blockchain Timestamping";
    page.drawText(footerRight, { x: width - marginX - helvetica.widthOfTextAtSize(footerRight, SIZE_BODY), y: footerY - 4, size: SIZE_BODY, font: helvetica, color: gray });

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
        "x-docuproof-version": "proof_pdf v14.1.0",
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
