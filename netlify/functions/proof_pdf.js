// netlify/functions/proof_pdf.js
// v16.1.0 – Fixed footer overlap

const fs = require("fs");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");

function hex(h) {
  return rgb(parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255);
}

exports.handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const id = qp.id || "unknown";
  const displayName = qp.displayName || "Untitled";
  const hash = qp.hash || "N/A";
  const verifyUrl = qp.verifyUrl || `https://docuproof.io/v/${encodeURIComponent(id)}`;
  const blockHeight = qp.block || qp.blockHeight || null;
  const createdAt = qp.createdAt || new Date().toISOString();
  const filename = qp.filename || qp.displayName || "document";

  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle("Certificate of Proof of Existence");
    pdfDoc.setAuthor("docuProof.io");
    pdfDoc.setCreator("docuProof v16.1.0");

    // US Letter: 612 x 792 points
    const page = pdfDoc.addPage([612, 792]);
    const W = 612, H = 792;
    
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Colors
    const GREEN = hex("#22c55e");
    const DARK_GREEN = hex("#15803d");
    const BLACK = hex("#111827");
    const GRAY = hex("#6b7280");
    const LIGHT_BG = hex("#f0fdf4");
    const GRAY_BG = hex("#f3f4f6");
    const BORDER = hex("#d1d5db");

    // Margins
    const M = 50;
    const CW = W - M * 2;
    const CX = W / 2;
    
    // Footer zone - content must stay ABOVE this
    const FOOTER_ZONE = 75;

    // =========================================================================
    // BORDER & CORNERS
    // =========================================================================
    page.drawRectangle({ x: 20, y: 20, width: W - 40, height: H - 40, borderColor: GREEN, borderWidth: 2 });
    page.drawRectangle({ x: 15, y: H - 35, width: 20, height: 20, color: GREEN });
    page.drawRectangle({ x: W - 35, y: H - 35, width: 20, height: 20, color: GREEN });

    // =========================================================================
    // LOGO
    // =========================================================================
    let Y = H - 50;
    
    const logoPaths = ["./netlify/functions/assets/logo_nobg.png", "./netlify/functions/assets/logo.png"];
    let logo = null;
    for (const p of logoPaths) {
      if (fs.existsSync(p)) {
        try { logo = await pdfDoc.embedPng(fs.readFileSync(p)); break; } catch {}
      }
    }
    
    const logoS = 44;
    const logoP = 4;
    const logoBox = logoS + logoP * 2;
    page.drawRectangle({ x: CX - logoBox/2, y: Y - logoBox, width: logoBox, height: logoBox, color: hex("#0f172a") });
    if (logo) page.drawImage(logo, { x: CX - logoS/2, y: Y - logoBox + logoP, width: logoS, height: logoS });
    Y -= logoBox + 18;

    // =========================================================================
    // TITLE
    // =========================================================================
    const t1 = "CERTIFICATE OF";
    page.drawText(t1, { x: CX - font.widthOfTextAtSize(t1, 10)/2, y: Y, size: 10, font, color: GRAY });
    Y -= 28;
    
    const t2 = "PROOF OF EXISTENCE";
    page.drawText(t2, { x: CX - fontBold.widthOfTextAtSize(t2, 26)/2, y: Y, size: 26, font: fontBold, color: BLACK });
    Y -= 14;
    
    const t3 = "Immutable Blockchain Timestamp";
    page.drawText(t3, { x: CX - font.widthOfTextAtSize(t3, 9)/2, y: Y, size: 9, font, color: GRAY });
    Y -= 16;
    
    page.drawLine({ start: { x: CX - 70, y: Y }, end: { x: CX + 70, y: Y }, thickness: 2, color: GREEN });
    Y -= 22;

    // =========================================================================
    // HOW IT WORKS BOX
    // =========================================================================
    const boxH = 50;
    page.drawRectangle({ x: M, y: Y - boxH, width: CW, height: boxH, color: LIGHT_BG, borderColor: GREEN, borderWidth: 1 });
    
    const b1 = "HOW THIS PROOF WORKS";
    page.drawText(b1, { x: CX - fontBold.widthOfTextAtSize(b1, 10)/2, y: Y - 16, size: 10, font: fontBold, color: DARK_GREEN });
    
    const b2 = "To prove your file existed on this date, you need:  Your Original File + This Certificate";
    page.drawText(b2, { x: CX - font.widthOfTextAtSize(b2, 9)/2, y: Y - 34, size: 9, font, color: BLACK });
    
    Y -= boxH + 20;

    // =========================================================================
    // DETAILS + QR CODE
    // =========================================================================
    const qrS = 80;
    const qrX = W - M - qrS;
    const qrY = Y - qrS;
    
    // QR
    const qrBuf = await QRCode.toBuffer(verifyUrl, { width: 160, margin: 0, color: { dark: "#111827", light: "#ffffff" } });
    const qrImg = await pdfDoc.embedPng(qrBuf);
    page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrS + 8, height: qrS + 8, borderColor: BORDER, borderWidth: 1 });
    page.drawImage(qrImg, { x: qrX, y: qrY, width: qrS, height: qrS });
    const qrLabel = "SCAN TO VERIFY";
    page.drawText(qrLabel, { x: qrX + (qrS - fontBold.widthOfTextAtSize(qrLabel, 7))/2, y: qrY - 14, size: 7, font: fontBold, color: DARK_GREEN });

    // Details
    const blockStr = blockHeight ? `Bitcoin Block #${blockHeight}` : "Pending";
    const dateStr = formatDate(createdAt);
    
    const fields = [
      ["PROOF ID", id],
      ["FILE NAME", displayName],
      ["TIMESTAMP", dateStr],
      ["BLOCKCHAIN", blockStr],
    ];
    
    let dY = Y;
    for (const [label, value] of fields) {
      page.drawText(label, { x: M, y: dY, size: 9, font: fontBold, color: DARK_GREEN });
      page.drawText(value, { x: M, y: dY - 14, size: 11, font: fontBold, color: BLACK });
      dY -= 36;
    }
    
    Y = Math.min(dY, qrY - 20);

    // =========================================================================
    // FILE FINGERPRINT
    // =========================================================================
    Y -= 5;
    page.drawText("FILE FINGERPRINT (SHA-256)", { x: M, y: Y, size: 9, font: fontBold, color: DARK_GREEN });
    Y -= 18;
    page.drawRectangle({ x: M, y: Y - 4, width: CW, height: 22, color: GRAY_BG });
    page.drawText(hash, { x: M + 8, y: Y + 2, size: 8, font, color: BLACK });
    Y -= 30;

    // =========================================================================
    // DIVIDER
    // =========================================================================
    page.drawLine({ start: { x: M, y: Y }, end: { x: W - M, y: Y }, thickness: 1, color: BORDER });
    Y -= 18;

    // =========================================================================
    // EXPLANATION SECTIONS
    // =========================================================================
    
    // Understanding
    page.drawText("UNDERSTANDING YOUR PROOF", { x: M, y: Y, size: 10, font: fontBold, color: DARK_GREEN });
    Y -= 14;
    
    const exp1 = "Your Proof ID is your lookup reference. The File Fingerprint is a unique code from your file—if anything changes, the fingerprint changes. This fingerprint is recorded on Bitcoin. To verify, upload your file and we confirm it matches.";
    Y = drawWrappedText(page, exp1, M, Y, CW, 9, font, BLACK, 12);
    Y -= 14;

    // Why It Matters
    page.drawText("WHY IT MATTERS", { x: M, y: Y, size: 10, font: fontBold, color: DARK_GREEN });
    Y -= 14;
    
    const exp2 = "Blockchain timestamps cannot be faked or altered. Your proof is permanent and verifiable by anyone.";
    Y = drawWrappedText(page, exp2, M, Y, CW, 9, font, BLACK, 12);
    Y -= 10;
    
    const uses = [
      "• Intellectual Property — Prove when you created work",
      "• Legal Evidence — Document authenticity for disputes", 
      "• Business — Verifiable audit trails",
      "• Personal — Secure wills and contracts",
    ];
    for (const u of uses) {
      page.drawText(u, { x: M, y: Y, size: 9, font, color: BLACK });
      Y -= 13;
    }
    Y -= 10;

    // How to Verify
    page.drawText("HOW TO VERIFY", { x: M, y: Y, size: 10, font: fontBold, color: DARK_GREEN });
    Y -= 14;
    
    const steps = [
      "1. Keep your original file safe",
      "2. Visit docuproof.io/v/" + id + " or scan QR code",
      "3. Upload your file to verify the fingerprint matches",
    ];
    for (const s of steps) {
      if (Y > FOOTER_ZONE) { // Only draw if above footer zone
        page.drawText(s, { x: M, y: Y, size: 9, font, color: BLACK });
        Y -= 13;
      }
    }

    // =========================================================================
    // FOOTER - fixed position
    // =========================================================================
    const footerY = 45;
    page.drawLine({ start: { x: M, y: footerY + 15 }, end: { x: W - M, y: footerY + 15 }, thickness: 2, color: GREEN });
    page.drawText("docuProof.io", { x: M, y: footerY, size: 9, font: fontBold, color: DARK_GREEN });
    const fr = "Trusted Blockchain Timestamping";
    page.drawText(fr, { x: W - M - font.widthOfTextAtSize(fr, 9), y: footerY, size: 9, font, color: GRAY });

    // =========================================================================
    // OUTPUT
    // =========================================================================
    const pdfBytes = await pdfDoc.save();
    const safeName = (filename || "document").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}-docuProof.pdf"`,
        "Cache-Control": "no-store",
        "x-version": "v16.1.0",
      },
      body: Buffer.from(pdfBytes).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

function drawWrappedText(page, text, x, y, maxW, size, font, color, lineH) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (font.widthOfTextAtSize(test, size) > maxW && line) {
      page.drawText(line, { x, y, size, font, color });
      y -= lineH;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y, size, font, color });
    y -= lineH;
  }
  return y;
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
           " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}
