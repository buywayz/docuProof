// netlify/functions/proof_pdf.js
// v7.0.0 — Clean, professional certificate matching approved design
// Features: Minimal elegant layout, no Quick Verify ID, clean typography

const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

// Convert inches to points (72 points per inch)
function inch(n) { return n * 72; }

exports.handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const id        = qp.id || "unknown";
  const rawFilename = qp.filename || "document";
  const filename = rawFilename.toLowerCase().endsWith('.pdf') ? rawFilename : rawFilename;
  const display   = qp.displayName || filename;
  const hash      = qp.hash || null;
  const verifyUrl = qp.verifyUrl || `https://docuproof.io/v/${encodeURIComponent(id)}`;
  const isRIP     = qp.rip === "true" || qp.rip === "1";
  const createdAt = qp.createdAt || new Date().toISOString();
  const blockNum  = qp.block || null; // Block number if anchored

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
    const colors = {
      black: "#000000",
      darkText: "#1a1a1a",
      bodyText: "#333333",
      muted: "#666666",
      lightText: "#888888",
      border: "#22c55e",      // Brand green for border
      accent: "#22c55e",      // Brand green
      darkGreen: "#166534",   // Darker green for text
      white: "#ffffff",
      cream: "#fafafa",
      boxBg: "#f5f5f5"
    };

    // === WHITE BACKGROUND ===
    doc.rect(0, 0, pageW, pageH).fill(colors.white);

    // === SINGLE GREEN BORDER ===
    const borderInset = inch(0.4);
    doc.lineWidth(2)
       .strokeColor(colors.border)
       .rect(borderInset, borderInset, pageW - 2 * borderInset, pageH - 2 * borderInset)
       .stroke();

    // === HEADER SECTION ===
    let y = marginT + inch(0.3);

    // Logo (centered at top)
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
      const logoX = centerX - (logoSize / 2);
      doc.image(logoUsed, logoX, y, { 
        width: logoSize, 
        height: logoSize
      });
      y += logoSize + inch(0.15);
    } else {
      // Fallback: Draw a simple document icon placeholder
      y += inch(0.1);
    }

    // Brand name "docuProof"
    doc.font("Helvetica-Bold")
       .fontSize(18)
       .fillColor(colors.accent)
       .text("docuProof", marginL, y, { width: contentW, align: "center" });
    y += inch(0.3);

    // Tagline
    doc.font("Helvetica-Oblique")
       .fontSize(10)
       .fillColor(colors.muted)
       .text("Proof you can point to.", marginL, y, { width: contentW, align: "center" });
    y += inch(0.35);

    // === SIMPLE HORIZONTAL DIVIDER ===
    const dividerW = inch(1.5);
    doc.lineWidth(1)
       .strokeColor(colors.accent)
       .moveTo(centerX - dividerW/2, y)
       .lineTo(centerX + dividerW/2, y)
       .stroke();
    y += inch(0.4);

    // === CERTIFICATE TITLE ===
    doc.font("Helvetica")
       .fontSize(11)
       .fillColor(colors.muted)
       .text("CERTIFICATE OF", marginL, y, { width: contentW, align: "center", characterSpacing: 2 });
    y += inch(0.28);

    doc.font("Helvetica-Bold")
       .fontSize(22)
       .fillColor(colors.darkGreen)
       .text("PROOF OF EXISTENCE", marginL, y, { width: contentW, align: "center" });
    y += inch(0.35);

    // Subtitle
    doc.font("Helvetica")
       .fontSize(10)
       .fillColor(colors.lightText)
       .text("Blockchain-Anchored Timestamp", marginL, y, { width: contentW, align: "center" });
    y += inch(0.5);

    // === DOCUMENT DETAILS BOX ===
    const boxLeft = marginL + inch(0.3);
    const boxWidth = contentW - inch(0.6);
    const boxPadding = inch(0.25);
    
    // Calculate box height based on content
    const rowHeight = inch(0.32);
    const headerHeight = inch(0.4);
    const numRows = 4; // Proof ID, Document, Timestamp, Block
    const boxHeight = headerHeight + (numRows * rowHeight) + inch(0.3);
    
    const boxTop = y;

    // Draw box background
    doc.rect(boxLeft, boxTop, boxWidth, boxHeight)
       .fill(colors.boxBg);
    
    // Draw box border
    doc.lineWidth(1)
       .strokeColor(colors.border)
       .rect(boxLeft, boxTop, boxWidth, boxHeight)
       .stroke();

    // Box header
    y = boxTop + boxPadding;
    doc.font("Helvetica-Bold")
       .fontSize(10)
       .fillColor(colors.darkGreen)
       .text("DOCUMENT DETAILS", boxLeft + boxPadding, y, { characterSpacing: 1 });
    
    // Divider under header
    y += inch(0.25);
    doc.lineWidth(0.5)
       .strokeColor("#dddddd")
       .moveTo(boxLeft + boxPadding, y)
       .lineTo(boxLeft + boxWidth - boxPadding, y)
       .stroke();
    y += inch(0.2);

    // Details rows - clean two-column layout
    const labelX = boxLeft + boxPadding;
    const valueX = boxLeft + inch(1.3);
    const valueWidth = boxWidth - inch(1.3) - boxPadding - inch(1.4); // Leave room for QR

    const details = [
      ["Proof ID:", id],
      ["Document:", display],
      ["Timestamp:", formatDate(createdAt)],
      ["Block:", blockNum ? `#${Number(blockNum).toLocaleString()}` : "Pending confirmation"]
    ];

    for (const [label, value] of details) {
      doc.font("Helvetica")
         .fontSize(9)
         .fillColor(colors.muted)
         .text(label, labelX, y);

      doc.font("Helvetica-Bold")
         .fontSize(9)
         .fillColor(colors.darkText)
         .text(value, valueX, y, { width: valueWidth, ellipsis: true });

      y += rowHeight;
    }

    // === QR CODE (inside the box, right side) ===
    const qrSize = inch(1.0);
    const qrX = boxLeft + boxWidth - qrSize - boxPadding - inch(0.1);
    const qrY = boxTop + headerHeight + inch(0.15);

    const qrPng = await QRCode.toBuffer(verifyUrl, {
      width: 200,
      margin: 0,
      color: { dark: "#1a1a1a", light: "#f5f5f5" },
      errorCorrectionLevel: "M"
    });

    // QR code border
    doc.lineWidth(0.5)
       .strokeColor(colors.border)
       .rect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4)
       .stroke();

    doc.image(qrPng, qrX, qrY, { width: qrSize });

    // QR label
    doc.font("Helvetica-Bold")
       .fontSize(7)
       .fillColor(colors.muted)
       .text("SCAN TO VERIFY", qrX - 2, qrY + qrSize + inch(0.08), { 
         width: qrSize + 4, 
         align: "center" 
       });
    
    // Verification URL under QR
    doc.font("Helvetica")
       .fontSize(6)
       .fillColor(colors.lightText)
       .text(`docuproof.io/v/${id.slice(0, 8)}...`, qrX - 2, qrY + qrSize + inch(0.22), { 
         width: qrSize + 4, 
         align: "center" 
       });

    // Move y below the box
    y = boxTop + boxHeight + inch(0.35);

    // === RIP SECTION (if enabled) ===
    if (isRIP) {
      const ripBoxHeight = inch(0.7);
      
      // Light green background
      doc.rect(boxLeft, y, boxWidth, ripBoxHeight)
         .fill("#f0fdf4");
      
      doc.lineWidth(1)
         .strokeColor(colors.accent)
         .rect(boxLeft, y, boxWidth, ripBoxHeight)
         .stroke();

      // RIP badge
      doc.roundedRect(boxLeft + boxPadding, y + inch(0.15), inch(1.1), inch(0.22), 3)
         .fill(colors.accent);

      doc.font("Helvetica-Bold")
         .fontSize(7)
         .fillColor(colors.white)
         .text("✓ RIP VERIFIED", boxLeft + boxPadding + inch(0.08), y + inch(0.2));

      // RIP text
      doc.font("Helvetica-Bold")
         .fontSize(9)
         .fillColor(colors.darkGreen)
         .text("Redundant Identity Preservation", boxLeft + inch(1.3), y + inch(0.18));

      const ripDate = new Date().toISOString().split("T")[0];
      doc.font("Helvetica")
         .fontSize(8)
         .fillColor(colors.bodyText)
         .text(`Three independent copies verified bit-identical on ${ripDate}.`, boxLeft + boxPadding, y + inch(0.45));

      y += ripBoxHeight + inch(0.35);
    }

    // === VERIFICATION INSTRUCTIONS ===
    const instBoxHeight = inch(1.1);
    
    doc.rect(boxLeft, y, boxWidth, instBoxHeight)
       .fill(colors.cream);
    
    doc.lineWidth(0.5)
       .strokeColor("#dddddd")
       .rect(boxLeft, y, boxWidth, instBoxHeight)
       .stroke();

    let instY = y + boxPadding;
    doc.font("Helvetica-Bold")
       .fontSize(9)
       .fillColor(colors.darkGreen)
       .text("VERIFICATION INSTRUCTIONS", boxLeft + boxPadding, instY, { characterSpacing: 0.5 });

    instY += inch(0.25);
    const instructions = [
      "1. Visit the verification URL or scan the QR code",
      "2. Compare your original file's SHA-256 hash with the recorded value",
      "3. Verify blockchain anchor status shows confirmed",
      "4. This proof is independently verifiable using any OpenTimestamps tool"
    ];

    doc.font("Helvetica")
       .fontSize(8)
       .fillColor(colors.bodyText);

    for (const inst of instructions) {
      doc.text(inst, boxLeft + boxPadding, instY, { width: boxWidth - (boxPadding * 2) });
      instY += inch(0.17);
    }

    // === FOOTER ===
    const footerY = pageH - marginT - inch(0.3);

    // Simple divider line
    doc.lineWidth(0.5)
       .strokeColor(colors.accent)
       .moveTo(marginL + inch(1), footerY + inch(0.2))
       .lineTo(pageW - marginR - inch(1), footerY + inch(0.2))
       .stroke();

    // Footer text
    doc.font("Helvetica")
       .fontSize(9)
       .fillColor(colors.muted)
       .text("docuProof.io  •  Proof of Existence on the Blockchain", marginL, footerY - inch(0.05), {
         width: contentW,
         align: "center"
       });

    // === FINALIZE ===
    doc.end();
    const pdf = await done;
    const b64 = pdf.toString("base64");

    // Generate output filename
    const baseFilename = display.replace(/\.[^.]+$/, ""); // Remove extension
    const safeBase = baseFilename.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
    const outputFilename = isRIP 
      ? `${safeBase}-docuProof-RIP-certificate.pdf`
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

// Helper: Format ISO date to clean readable format
function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    const options = {
      year: "numeric",
      month: "short",
      day: "numeric"
    };
    return d.toLocaleDateString("en-US", options);
  } catch {
    return isoString;
  }
}
