// netlify/functions/proof_pdf.js
// v19.0.0 — Official legal-style certificate with RIP support
// - v19: "fingerprint" → "hash" terminology throughout
// - Cream/parchment background (printer-friendly)
// - Serif fonts for legal gravitas
// - Proper filename + display name handling
// - RIP-enhanced certificate variant

const fs = require("fs");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");

function hex(h) {
  return rgb(parseInt(h.slice(1,3),16)/255, parseInt(h.slice(3,5),16)/255, parseInt(h.slice(5,7),16)/255);
}

exports.handler = async (event) => {
  const qp = event.queryStringParameters || {};
  const id = qp.id || "unknown";
  const displayName = qp.displayName || "";
  const filename = qp.filename || "";
  const hash = qp.hash || "N/A";
  const isRip = qp.rip === "true" || qp.rip === "1";
  if (!qp.hash) {
    console.warn(`[proof_pdf] WARNING: No hash provided for proof ${id}. Certificate will show N/A.`);
  }
  const verifyUrl = qp.verifyUrl || `https://docuproof.io/v/${encodeURIComponent(id)}`;
  const blockHeight = qp.block || qp.blockHeight || null;
  const createdAt = qp.createdAt || new Date().toISOString();

  // Smart label: show what we have
  // Priority: displayName > filename > nothing
  const certDisplayName = displayName && displayName !== "Untitled" && displayName !== "Document Proof"
    ? displayName
    : "";
  const certFilename = filename && filename !== "document" && filename !== "DocuProof-Certificate.pdf"
    ? filename
    : "";
  const downloadName = (certFilename || certDisplayName || "document").replace(/[^a-zA-Z0-9-_. ]/g, "_").slice(0, 50);

  try {
    const pdfDoc = await PDFDocument.create();
    pdfDoc.setTitle("Certificate of Proof of Existence");
    pdfDoc.setAuthor("docuProof.io");
    pdfDoc.setCreator("docuProof v19.0.0");

    // US Letter: 612 x 792 points
    const page = pdfDoc.addPage([612, 792]);
    const W = 612, H = 792;
    
    // Fonts — serif for legal feel, sans for labels
    const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const serifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Colors — warm, official palette
    const CREAM = hex("#f5f0e0");
    const CREAM_DARK = hex("#ebe4cc");
    const GOLD = hex("#8b7535");
    const GOLD_LIGHT = hex("#c9a84c");
    const DARK = hex("#1a1a1a");
    const DARK_GREEN = hex("#15803d");
    const GREEN = hex("#22c55e");
    const MEDIUM = hex("#4a4a4a");
    const GRAY = hex("#6b6b6b");
    const LIGHT_GRAY = hex("#999999");
    const RULE = hex("#c8b87a");
    const FIELD_BG = hex("#f5f0e0");
    const WHITE = hex("#ffffff");

    // Margins
    const M = 50;
    const CW = W - M * 2;
    const CX = W / 2;
    const FOOTER_ZONE = 60;

    // =========================================================================
    // BACKGROUND — cream/parchment
    // =========================================================================
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });

    // =========================================================================
    // OUTER BORDER — double line, gold
    // =========================================================================
    page.drawRectangle({ x: 18, y: 18, width: W - 36, height: H - 36, borderColor: GOLD, borderWidth: 2 });
    page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: GOLD_LIGHT, borderWidth: 0.75 });

    // Corner flourishes (small gold squares)
    const cs = 8;
    page.drawRectangle({ x: 18, y: H - 18 - cs, width: cs, height: cs, color: GOLD });
    page.drawRectangle({ x: W - 18 - cs, y: H - 18 - cs, width: cs, height: cs, color: GOLD });
    page.drawRectangle({ x: 18, y: 18, width: cs, height: cs, color: GOLD });
    page.drawRectangle({ x: W - 18 - cs, y: 18, width: cs, height: cs, color: GOLD });

    // =========================================================================
    // LOGO
    // =========================================================================
    let Y = H - 48;

    const logoPaths = ["./netlify/functions/assets/logo_nobg.png", "./netlify/functions/assets/logo.png"];
    let logo = null;
    for (const p of logoPaths) {
      if (fs.existsSync(p)) {
        try { logo = await pdfDoc.embedPng(fs.readFileSync(p)); break; } catch {}
      }
    }

    const logoS = 40;
    const logoP = 4;
    const logoBox = logoS + logoP * 2;
    page.drawRectangle({ x: CX - logoBox/2, y: Y - logoBox, width: logoBox, height: logoBox, color: hex("#0f172a"), borderColor: GOLD, borderWidth: 1 });
    if (logo) page.drawImage(logo, { x: CX - logoS/2, y: Y - logoBox + logoP, width: logoS, height: logoS });
    Y -= logoBox + 14;

    // =========================================================================
    // TITLE BLOCK
    // =========================================================================
    const t0 = "docuProof.io";
    page.drawText(t0, { x: CX - sans.widthOfTextAtSize(t0, 9)/2, y: Y, size: 9, font: sans, color: GOLD });
    Y -= 20;

    const t1 = "CERTIFICATE OF";
    page.drawText(t1, { x: CX - serifBold.widthOfTextAtSize(t1, 13)/2, y: Y, size: 13, font: serifBold, color: MEDIUM });
    Y -= 32;

    const t2 = "PROOF OF EXISTENCE";
    page.drawText(t2, { x: CX - serifBold.widthOfTextAtSize(t2, 28)/2, y: Y, size: 28, font: serifBold, color: DARK });
    Y -= 18;

    // Gold rule
    const ruleW = 180;
    page.drawLine({ start: { x: CX - ruleW/2, y: Y }, end: { x: CX + ruleW/2, y: Y }, thickness: 1.5, color: GOLD });
    Y -= 6;
    page.drawLine({ start: { x: CX - ruleW/2 + 20, y: Y }, end: { x: CX + ruleW/2 - 20, y: Y }, thickness: 0.5, color: GOLD_LIGHT });
    Y -= 14;

    const t3 = "Immutable Blockchain Timestamp";
    page.drawText(t3, { x: CX - serifItalic.widthOfTextAtSize(t3, 11)/2, y: Y, size: 11, font: serifItalic, color: GRAY });
    Y -= 12;

    // RIP badge
    if (isRip) {
      Y -= 4;
      const ripBadge = "REDUNDANT IDENTITY PRESERVATION (RIP) VERIFIED";
      const ripBadgeW = sansBold.widthOfTextAtSize(ripBadge, 7.5);
      const ripPad = 10;
      page.drawRectangle({ x: CX - (ripBadgeW + ripPad * 2)/2, y: Y - 4, width: ripBadgeW + ripPad * 2, height: 16, color: DARK_GREEN, borderColor: GOLD, borderWidth: 0.5 });
      page.drawText(ripBadge, { x: CX - ripBadgeW/2, y: Y, size: 7.5, font: sansBold, color: WHITE });
      Y -= 18;
    }

    Y -= 8;

    // =========================================================================
    // CERTIFICATION STATEMENT
    // =========================================================================
    const stmtH = 48;
    page.drawRectangle({ x: M, y: Y - stmtH, width: CW, height: stmtH, color: CREAM_DARK, borderColor: RULE, borderWidth: 0.5 });

    const certStmt = "This certificate attests that the below-identified digital document existed in its exact form on the date and time recorded, as verified by its cryptographic hash permanently anchored to the Bitcoin blockchain.";
    drawWrappedText(page, certStmt, M + 12, Y - 12, CW - 24, 9.5, serifItalic, MEDIUM, 13);
    Y -= stmtH + 16;

    // =========================================================================
    // DETAILS + QR CODE
    // =========================================================================
    const qrS = 80;
    const qrX = W - M - qrS;
    const qrY = Y - qrS;

    // QR
    const qrBuf = await QRCode.toBuffer(verifyUrl, { width: 160, margin: 0, color: { dark: "#1a1a1a", light: "#f5f0e0" } });
    const qrImg = await pdfDoc.embedPng(qrBuf);
    page.drawRectangle({ x: qrX - 4, y: qrY - 4, width: qrS + 8, height: qrS + 8, borderColor: RULE, borderWidth: 0.75 });
    page.drawImage(qrImg, { x: qrX, y: qrY, width: qrS, height: qrS });
    const qrLabel = "SCAN TO VERIFY";
    page.drawText(qrLabel, { x: qrX + (qrS - sansBold.widthOfTextAtSize(qrLabel, 6.5))/2, y: qrY - 12, size: 6.5, font: sansBold, color: GOLD });

    // Detail fields
    const detailW = CW - qrS - 30;
    const blockStr = blockHeight ? `Bitcoin Block #${blockHeight}` : "Pending";
    const dateStr = formatDate(createdAt);

    const fields = [
      ["PROOF ID", id],
    ];

    // Add filename if provided
    if (certFilename) {
      fields.push(["FILE NAME", certFilename]);
    }

    // Add display name / registered by if provided
    if (certDisplayName && certDisplayName !== certFilename) {
      fields.push(["REGISTERED BY", certDisplayName]);
    }

    fields.push(["TIMESTAMP", dateStr]);
    fields.push(["BLOCKCHAIN", blockStr]);

    let dY = Y;
    for (const [label, value] of fields) {
      page.drawText(label, { x: M, y: dY, size: 8, font: sansBold, color: GOLD });
      // Truncate long values to fit
      let displayVal = value;
      const maxValW = detailW - 10;
      while (serifBold.widthOfTextAtSize(displayVal, 11) > maxValW && displayVal.length > 10) {
        displayVal = displayVal.slice(0, -4) + "...";
      }
      page.drawText(displayVal, { x: M, y: dY - 14, size: 11, font: serifBold, color: DARK });
      dY -= 34;
    }

    Y = Math.min(dY, qrY - 18);

    // =========================================================================
    // FILE HASH
    // =========================================================================
    Y -= 4;
    page.drawText("FILE HASH (SHA-256)", { x: M, y: Y, size: 8, font: sansBold, color: GOLD });
    Y -= 20;
    page.drawRectangle({ x: M, y: Y - 6, width: CW, height: 22, color: FIELD_BG, borderColor: RULE, borderWidth: 0.5 });
    page.drawText(hash, { x: M + 8, y: Y, size: 7.5, font: sans, color: DARK });
    Y -= 28;

    // =========================================================================
    // DIVIDER
    // =========================================================================
    page.drawLine({ start: { x: M, y: Y }, end: { x: W - M, y: Y }, thickness: 1, color: RULE });
    Y -= 16;

    // =========================================================================
    // EXPLANATION SECTIONS
    // =========================================================================
    
    // Understanding
    page.drawText("UNDERSTANDING YOUR PROOF", { x: M, y: Y, size: 9, font: sansBold, color: GOLD });
    Y -= 14;

    const exp1 = "Your Proof ID is your unique lookup reference. The File Hash (SHA-256) is a one-way mathematical code derived from your file\u2014if even a single byte changes, the hash changes entirely. This hash has been permanently recorded on the Bitcoin blockchain, providing independently verifiable proof that your file existed at the timestamp above.";
    Y = drawWrappedText(page, exp1, M, Y, CW, 9, serif, MEDIUM, 12);
    Y -= 12;

    // Legal Significance
    page.drawText("LEGAL SIGNIFICANCE", { x: M, y: Y, size: 9, font: sansBold, color: GOLD });
    Y -= 14;

    const exp2 = "Blockchain timestamps are immutable and independently verifiable by any party. This certificate, combined with your original file, constitutes proof of prior existence admissible in legal proceedings, intellectual property disputes, and regulatory compliance audits.";
    Y = drawWrappedText(page, exp2, M, Y, CW, 9, serif, MEDIUM, 12);
    Y -= 10;

    // RIP section
    if (isRip) {
      page.drawText("REDUNDANT IDENTITY PRESERVATION", { x: M, y: Y, size: 9, font: sansBold, color: GOLD });
      Y -= 14;

      const ripExp = "This proof has been enhanced with Redundant Identity Preservation. Three identical copies of the original file have been cryptographically verified against the blockchain-anchored hash. These copies, stored in separate locations, ensure that your proof survives even if one copy is lost, corrupted, or destroyed\u2014providing an additional layer of evidentiary integrity.";
      Y = drawWrappedText(page, ripExp, M, Y, CW, 9, serif, MEDIUM, 12);
      Y -= 10;
    }

    // How to Verify
    if (Y > FOOTER_ZONE + 60) {
      page.drawText("VERIFICATION PROCEDURE", { x: M, y: Y, size: 9, font: sansBold, color: GOLD });
      Y -= 14;

      const steps = isRip ? [
        "1.  Retain your original file and two backup copies in separate secure locations.",
        "2.  Navigate to docuproof.io/v/" + id + " or scan the QR code on this certificate.",
        "3.  Upload any of your three verified copies to confirm the hash matches.",
      ] : [
        "1.  Retain your original file in a secure location. Do not modify it.",
        "2.  Navigate to docuproof.io/v/" + id + " or scan the QR code on this certificate.",
        "3.  Upload your file to confirm the cryptographic hash matches the blockchain record.",
      ];
      for (const s of steps) {
        if (Y > FOOTER_ZONE + 10) {
          page.drawText(s, { x: M, y: Y, size: 9, font: serif, color: MEDIUM });
          Y -= 13;
        }
      }
    }

    // =========================================================================
    // FOOTER
    // =========================================================================
    const footerY = 40;
    page.drawLine({ start: { x: M, y: footerY + 16 }, end: { x: W - M, y: footerY + 16 }, thickness: 1.5, color: GOLD });
    page.drawText("docuProof.io", { x: M, y: footerY, size: 9, font: sansBold, color: GOLD });

    const fr = "Bitcoin-Anchored Proof of Existence";
    page.drawText(fr, { x: CX - serifItalic.widthOfTextAtSize(fr, 8)/2, y: footerY, size: 8, font: serifItalic, color: GRAY });

    const fr2 = "Certificate ID: " + id;
    page.drawText(fr2, { x: W - M - sans.widthOfTextAtSize(fr2, 7), y: footerY, size: 7, font: sans, color: LIGHT_GRAY });

    // =========================================================================
    // OUTPUT
    // =========================================================================
    const pdfBytes = await pdfDoc.save();
    const safeName = downloadName.replace(/[^a-zA-Z0-9-_. ]/g, "_").slice(0, 50);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}-docuProof-Certificate.pdf"`,
        "Cache-Control": "no-store",
        "x-version": "v19.0.0",
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
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
           " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  } catch { return iso; }
}
