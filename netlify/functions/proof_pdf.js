// netlify/functions/proof_pdf.js
// v7.0.0 — Compact elegant certificate matching brand design
// Single page, clean layout, decorative corner accents

const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

// Convert inches to points (72 points per inch)
function inch(n) { return n * 72; }

exports.handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const id        = qp.id || "unknown";
  const rawFilename = qp.filename || "docuProof";
  const filename = rawFilename.toLowerCase().endsWith('.pdf') ? rawFilename : `${rawFilename}.pdf`;
  const display   = qp.displayName || "Untitled";
  const hash      = qp.hash || null;
  const verifyUrl = qp.verifyUrl || `https://docuproof.io/v/${encodeURIComponent(id)}`;
  const quickId   = qp.quickId || "----------";
  const blockHeight = qp.block || qp.blockHeight || null;
  const isRIP     = qp.rip === "true" || qp.rip === "1";
  const createdAt = qp.createdAt || new Date().toISOString();

  try {
    // US Letter: 8.5" × 11" (612 × 792 points)
    const doc = new PDFDocument({
      size: "LETTER",
      margins: {
        top: inch(0.75),
        bottom: inch(0.75),
        left: inch(0.75),
        right: inch(0.75)
      },
      info: {
        Title: "Certificate of Proof of Existence",
        Author: "docuProof.io",
        Subject: `Proof ID: ${id}`,
        Creator: "docuProof Certificate Generator v7.0.0"
      },
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((resolve) =>
      doc.on("end", () => resolve(Buffer.concat(chunks)))
    );

    const pageW = doc.page.width;   // 612
    const pageH = doc.page.height;  // 792
    const marginL = doc.page.margins.left;
    const marginR = doc.page.margins.right;
    const marginT = doc.page.margins.top;
    const contentW = pageW - marginL - marginR;
    const centerX = pageW / 2;

    // === COLOR PALETTE ===
    const green = "#22c55e";
    const darkGreen = "#166534";
    const black = "#1a1a1a";
    const gray = "#6b7280";
    const lightGray = "#9ca3af";
    const borderGray = "#e5e7eb";
    const white = "#ffffff";

    // === WHITE BACKGROUND ===
    doc.rect(0, 0, pageW, pageH).fill(white);

    // === DECORATIVE CORNER ACCENTS ===
    const cornerSize = inch(0.6);
    const cornerOffset = inch(0.4);
    const cornerWidth = 3;

    doc.lineWidth(cornerWidth).strokeColor(green);

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

    // Bottom-left corner
    doc.moveTo(cornerOffset, pageH - cornerOffset - cornerSize)
       .lineTo(cornerOffset, pageH - cornerOffset)
       .lineTo(cornerOffset + cornerSize, pageH - cornerOffset)
       .stroke();

    // Bottom-right corner
    doc.moveTo(pageW - cornerOffset - cornerSize, pageH - cornerOffset)
       .lineTo(pageW - cornerOffset, pageH - cornerOffset)
       .lineTo(pageW - cornerOffset, pageH - cornerOffset - cornerSize)
       .stroke();

    // === LOGO WITH DARK BACKGROUND ===
    let y = marginT + inch(0.3);

    const logoPaths = [
      "./netlify/functions/assets/logo_nobg.png",
      "./netlify/functions/assets/logo.png",
      "./docuproof-logo.png"
    ];
    let logoUsed = null;
    for (const p of logoPaths) {
      if (fs.existsSync(p)) {
        logoUsed = p;
        break;
      }
    }
    
    if (logoUsed) {
      const logoSize = inch(0.7);
      const logoBgSize = logoSize + inch(0.25);
      const logoBgX = centerX - logoBgSize / 2;
      const logoX = centerX - logoSize / 2;
      
      // Dark rounded background behind logo
      doc.roundedRect(logoBgX, y - inch(0.05), logoBgSize, logoBgSize, 10)
         .fill("#0a0d10");
      
      doc.image(logoUsed, logoX, y + inch(0.075), { width: logoSize, height: logoSize });
      y += logoBgSize + inch(0.15);
    }

    // === BRAND NAME ===
    doc.font("Helvetica-Bold")
       .fontSize(18)
       .fillColor(green)
       .text("docuProof", marginL, y, { width: contentW, align: "center" });
    y += inch(0.25);

    // === TAGLINE ===
    doc.font("Helvetica-Oblique")
       .fontSize(10)
       .fillColor(gray)
       .text("Proof you can point to.", marginL, y, { width: contentW, align: "center" });
    y += inch(0.35);

    // === DECORATIVE DOTS ===
    const dotY = y;
    doc.circle(centerX - 20, dotY, 3).fill(green);
    doc.circle(centerX, dotY, 3).fill(green);
    doc.circle(centerX + 20, dotY, 3).fill(green);
    y += inch(0.4);

    // === CERTIFICATE OF ===
    doc.font("Helvetica")
       .fontSize(10)
       .fillColor(gray)
       .text("CERTIFICATE OF", marginL, y, { width: contentW, align: "center", characterSpacing: 2 });
    y += inch(0.25);

    // === PROOF OF EXISTENCE ===
    doc.font("Helvetica-Bold")
       .fontSize(22)
       .fillColor(black)
       .text("PROOF OF EXISTENCE", marginL, y, { width: contentW, align: "center" });
    y += inch(0.3);

    // === SUBTITLE ===
    doc.font("Helvetica")
       .fontSize(9)
       .fillColor(lightGray)
       .text("Blockchain-Anchored Timestamp", marginL, y, { width: contentW, align: "center" });
    y += inch(0.5);

    // === DOCUMENT DETAILS BOX ===
    const boxTop = y;
    const boxLeft = marginL + inch(0.3);
    const boxWidth = contentW - inch(0.6);
    const boxHeight = inch(1.5);

    // Box outline
    doc.lineWidth(1)
       .strokeColor(borderGray)
       .rect(boxLeft, boxTop, boxWidth, boxHeight)
       .stroke();

    // Header background
    doc.rect(boxLeft, boxTop, boxWidth, inch(0.35))
       .fill("#f9fafb");

    // Header text
    doc.font("Helvetica-Bold")
       .fontSize(9)
       .fillColor(darkGreen)
       .text("DOCUMENT DETAILS", boxLeft + inch(0.2), boxTop + inch(0.12), { characterSpacing: 1 });

    // Details rows
    const labelX = boxLeft + inch(0.2);
    const valueX = boxLeft + inch(1.2);
    let rowY = boxTop + inch(0.5);
    const rowHeight = inch(0.25);

    const blockDisplay = blockHeight ? `#${blockHeight}` : "Pending confirmation";

    const details = [
      ["Proof ID:", id],
      ["Document:", display],
      ["Timestamp:", formatDate(createdAt)],
      ["Block:", blockDisplay]
    ];

    for (const [label, value] of details) {
      doc.font("Helvetica")
         .fontSize(9)
         .fillColor(gray)
         .text(label, labelX, rowY);

      doc.font("Helvetica-Bold")
         .fontSize(9)
         .fillColor(black)
         .text(value, valueX, rowY, { width: boxWidth - inch(2.8) });

      rowY += rowHeight;
    }

    // === QR CODE (inside box, right side) ===
    const qrSize = inch(1.0);
    const qrX = boxLeft + boxWidth - qrSize - inch(0.2);
    const qrY = boxTop + inch(0.45);

    const qrPng = await QRCode.toBuffer(verifyUrl, {
      width: 200,
      margin: 0,
      color: { dark: "#1a1a1a", light: "#ffffff" },
      errorCorrectionLevel: "M"
    });

    doc.image(qrPng, qrX, qrY, { width: qrSize - inch(0.1) });

    // QR label
    doc.font("Helvetica-Bold")
       .fontSize(7)
       .fillColor(black)
       .text("SCAN TO VERIFY", qrX - inch(0.05), qrY + qrSize - inch(0.05), { width: qrSize, align: "center" });

    // Short verify URL under QR
    const shortUrl = `docuproof.io/v/${id.slice(0, 8)}...`;
    doc.font("Helvetica")
       .fontSize(6)
       .fillColor(lightGray)
       .text(shortUrl, qrX - inch(0.05), qrY + qrSize + inch(0.08), { width: qrSize, align: "center" });

    y = boxTop + boxHeight + inch(0.4);

    // === RIP SECTION (if enabled) ===
    if (isRIP) {
      const ripBoxTop = y;
      const ripBoxHeight = inch(0.6);

      doc.lineWidth(1)
         .strokeColor(green)
         .roundedRect(boxLeft, ripBoxTop, boxWidth, ripBoxHeight, 4)
         .stroke();

      doc.font("Helvetica-Bold")
         .fontSize(9)
         .fillColor(green)
         .text("✓ RIP VERIFIED", boxLeft + inch(0.2), ripBoxTop + inch(0.15));

      doc.font("Helvetica")
         .fontSize(8)
         .fillColor(gray)
         .text("Redundant Identity Preservation — Three independent copies verified bit-identical.", boxLeft + inch(0.2), ripBoxTop + inch(0.35));

      y += ripBoxHeight + inch(0.3);
    }

    // === FOOTER ===
    const footerY = pageH - marginT - inch(0.6);

    // Decorative line
    doc.lineWidth(1)
       .strokeColor(green)
       .moveTo(centerX - inch(2), footerY)
       .lineTo(centerX + inch(2), footerY)
       .stroke();

    // Footer text
    doc.font("Helvetica")
       .fontSize(9)
       .fillColor(gray)
       .text("docuProof.io  •  Proof of Existence on the Blockchain", marginL, footerY + inch(0.15), {
         width: contentW,
         align: "center"
       });

    // === FINALIZE ===
    doc.end();
    const pdf = await done;
    const b64 = pdf.toString("base64");

    // Generate output filename
    const baseFilename = filename.replace(/\.pdf$/i, "");
    const safeBase = baseFilename.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
    const outputFilename = isRIP 
      ? `${safeBase}-docuProof-RIP-verified.pdf`
      : `${safeBase}-docuProof-certificate.pdf`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${outputFilename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Length": String(pdf.length),
        "x-docuproof-version": "proof_pdf v7.0.0",
      },
      body: b64,
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        ok: false,
        error: err.message,
        stack: err.stack?.split("\n").slice(0, 6),
      }),
    };
  }
};

// Helper: Format ISO date to short readable format
function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    const options = { year: "numeric", month: "short", day: "numeric" };
    return d.toLocaleDateString("en-US", options);
  } catch {
    return isoString;
  }
}
