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
    let y = marginT + inch(0.4);

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
      const logoSize = inch(0.8);
      const logoBgPadding = inch(0.06);
      const logoBgSize = logoSize + logoBgPadding * 2;
      const logoBgX = centerX - logoBgSize / 2;
      const logoX = centerX - logoSize / 2;
      
      // Dark rounded background behind logo (minimal padding)
      doc.roundedRect(logoBgX, y, logoBgSize, logoBgSize, 6)
         .fill("#0a0d10");
      
      doc.image(logoUsed, logoX, y + logoBgPadding, { width: logoSize, height: logoSize });
      y += logoBgSize + inch(0.2);
    }

    // === BRAND NAME ===
    doc.font("Helvetica-Bold")
       .fontSize(22)
       .fillColor(green)
       .text("docuProof", marginL, y, { width: contentW, align: "center" });
    y += inch(0.3);

    // === TAGLINE ===
    doc.font("Helvetica-Oblique")
       .fontSize(11)
       .fillColor(gray)
       .text("Proof you can point to.", marginL, y, { width: contentW, align: "center" });
    y += inch(0.35);

    // === DECORATIVE DOTS ===
    const dotY = y;
    doc.circle(centerX - 25, dotY, 3).fill(green);
    doc.circle(centerX, dotY, 3).fill(green);
    doc.circle(centerX + 25, dotY, 3).fill(green);
    y += inch(0.4);

    // === CERTIFICATE OF ===
    doc.font("Helvetica")
       .fontSize(11)
       .fillColor(gray)
       .text("CERTIFICATE OF", marginL, y, { width: contentW, align: "center", characterSpacing: 2 });
    y += inch(0.28);

    // === PROOF OF EXISTENCE ===
    doc.font("Helvetica-Bold")
       .fontSize(26)
       .fillColor(black)
       .text("PROOF OF EXISTENCE", marginL, y, { width: contentW, align: "center" });
    y += inch(0.32);

    // === SUBTITLE ===
    doc.font("Helvetica")
       .fontSize(10)
       .fillColor(lightGray)
       .text("Blockchain-Anchored Timestamp", marginL, y, { width: contentW, align: "center" });
    y += inch(0.45);

    // === DOCUMENT DETAILS BOX ===
    const boxTop = y;
    const boxLeft = marginL + inch(0.2);
    const boxWidth = contentW - inch(0.4);
    const boxHeight = inch(1.7);

    // Box outline
    doc.lineWidth(1)
       .strokeColor(borderGray)
       .rect(boxLeft, boxTop, boxWidth, boxHeight)
       .stroke();

    // Header background
    doc.rect(boxLeft, boxTop, boxWidth, inch(0.38))
       .fill("#f9fafb");

    // Header text
    doc.font("Helvetica-Bold")
       .fontSize(10)
       .fillColor(darkGreen)
       .text("DOCUMENT DETAILS", boxLeft + inch(0.25), boxTop + inch(0.12), { characterSpacing: 1 });

    // Details rows
    const labelX = boxLeft + inch(0.25);
    const valueX = boxLeft + inch(1.4);
    let rowY = boxTop + inch(0.55);
    const rowHeight = inch(0.28);

    const blockDisplay = blockHeight ? `#${blockHeight}` : "Pending confirmation";

    const details = [
      ["Proof ID:", id],
      ["Document:", display],
      ["Timestamp:", formatDate(createdAt)],
      ["Block:", blockDisplay]
    ];

    for (const [label, value] of details) {
      doc.font("Helvetica")
         .fontSize(10)
         .fillColor(gray)
         .text(label, labelX, rowY);

      doc.font("Helvetica-Bold")
         .fontSize(10)
         .fillColor(black)
         .text(value, valueX, rowY, { width: boxWidth - inch(3.0) });

      rowY += rowHeight;
    }

    // === QR CODE (inside box, right side) ===
    const qrSize = inch(1.15);
    const qrX = boxLeft + boxWidth - qrSize - inch(0.2);
    const qrY = boxTop + inch(0.48);

    const qrPng = await QRCode.toBuffer(verifyUrl, {
      width: 230,
      margin: 0,
      color: { dark: "#1a1a1a", light: "#ffffff" },
      errorCorrectionLevel: "M"
    });

    doc.image(qrPng, qrX, qrY, { width: qrSize - inch(0.1) });

    // QR label
    doc.font("Helvetica-Bold")
       .fontSize(7)
       .fillColor(black)
       .text("SCAN TO VERIFY", qrX - inch(0.05), qrY + qrSize - inch(0.08), { width: qrSize, align: "center" });

    // Short verify URL under QR
    const shortUrl = `docuproof.io/v/${id.slice(0, 8)}...`;
    doc.font("Helvetica")
       .fontSize(6)
       .fillColor(lightGray)
       .text(shortUrl, qrX - inch(0.05), qrY + qrSize + inch(0.05), { width: qrSize, align: "center" });

    y = boxTop + boxHeight + inch(0.25);

    // === SHA-256 HASH SECTION ===
    if (hash) {
      const hashBoxTop = y;
      const hashBoxHeight = inch(0.55);
      
      doc.lineWidth(1)
         .strokeColor(borderGray)
         .rect(boxLeft, hashBoxTop, boxWidth, hashBoxHeight)
         .stroke();
      
      doc.font("Helvetica-Bold")
         .fontSize(8)
         .fillColor(darkGreen)
         .text("CRYPTOGRAPHIC FINGERPRINT (SHA-256)", boxLeft + inch(0.25), hashBoxTop + inch(0.12));
      
      doc.font("Helvetica")
         .fontSize(7)
         .fillColor(black)
         .text(hash, boxLeft + inch(0.25), hashBoxTop + inch(0.35), { width: boxWidth - inch(0.5), characterSpacing: 0.5 });
      
      y = hashBoxTop + hashBoxHeight + inch(0.2);
    }

    // === LEGAL ATTESTATION ===
    const attestBoxTop = y;
    const attestBoxHeight = inch(1.25);
    
    doc.lineWidth(1)
       .strokeColor(borderGray)
       .rect(boxLeft, attestBoxTop, boxWidth, attestBoxHeight)
       .stroke();
    
    // Header
    doc.rect(boxLeft, attestBoxTop, boxWidth, inch(0.32))
       .fill("#f9fafb");
    
    doc.font("Helvetica-Bold")
       .fontSize(9)
       .fillColor(darkGreen)
       .text("LEGAL ATTESTATION", boxLeft + inch(0.25), attestBoxTop + inch(0.1));
    
    // Attestation text
    const attestY = attestBoxTop + inch(0.42);
    doc.font("Helvetica")
       .fontSize(8)
       .fillColor(black)
       .text(
         "This certificate attests that on the date and time indicated above, a cryptographic hash (SHA-256) of the referenced digital file was computed and submitted to the Bitcoin blockchain via the OpenTimestamps protocol.",
         boxLeft + inch(0.2), attestY, { width: boxWidth - inch(0.4), lineGap: 1 }
       );
    
    doc.text(
      "The blockchain record provides tamper-evident proof that the file existed in its exact form at the timestamp recorded. This proof is independently verifiable by any party using the original file and standard cryptographic tools.",
      boxLeft + inch(0.2), doc.y + inch(0.08), { width: boxWidth - inch(0.4), lineGap: 1 }
    );
    
    y = attestBoxTop + attestBoxHeight + inch(0.2);

    // === VERIFICATION INSTRUCTIONS ===
    const instBoxTop = y;
    const instBoxHeight = inch(1.0);
    
    doc.lineWidth(1)
       .strokeColor(borderGray)
       .rect(boxLeft, instBoxTop, boxWidth, instBoxHeight)
       .stroke();
    
    doc.rect(boxLeft, instBoxTop, boxWidth, inch(0.32))
       .fill("#f9fafb");
    
    doc.font("Helvetica-Bold")
       .fontSize(9)
       .fillColor(darkGreen)
       .text("HOW TO VERIFY THIS PROOF", boxLeft + inch(0.25), instBoxTop + inch(0.1));
    
    const instructions = [
      "1. Visit the verification URL or scan the QR code above",
      "2. Upload your original file to compute its SHA-256 hash",
      "3. Confirm the hash matches the recorded fingerprint",
      "4. Verify the Bitcoin block confirmation on any block explorer"
    ];
    
    let instY = instBoxTop + inch(0.42);
    doc.font("Helvetica")
       .fontSize(8)
       .fillColor(black);
    
    for (const inst of instructions) {
      doc.text(inst, boxLeft + inch(0.2), instY, { width: boxWidth - inch(0.4) });
      instY += inch(0.14);
    }

    y = instBoxTop + instBoxHeight + inch(0.2);

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
    const footerY = pageH - marginT - inch(0.7);

    // Decorative line
    doc.lineWidth(2)
       .strokeColor(green)
       .moveTo(centerX - inch(2.5), footerY)
       .lineTo(centerX + inch(2.5), footerY)
       .stroke();

    // Footer text
    doc.font("Helvetica")
       .fontSize(11)
       .fillColor(gray)
       .text("docuProof.io  •  Proof of Existence on the Blockchain", marginL, footerY + inch(0.2), {
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
