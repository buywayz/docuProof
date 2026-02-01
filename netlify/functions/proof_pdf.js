// netlify/functions/proof_pdf.js
// v7.3.0 — Single page certificate - tighter spacing

const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

function inch(n) { return n * 72; }

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
    const doc = new PDFDocument({
      size: "LETTER",
      margins: { top: inch(0.4), bottom: inch(0.4), left: inch(0.6), right: inch(0.6) },
      info: {
        Title: "Certificate of Proof of Existence",
        Author: "docuProof.io",
        Subject: `Proof ID: ${id}`,
        Creator: "docuProof Certificate Generator v7.3.0"
      },
      autoFirstPage: true,
      bufferPages: true
    });

    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    const done = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

    const pageW = 612;
    const pageH = 792;
    const marginL = inch(0.6);
    const contentW = pageW - marginL * 2;
    const centerX = pageW / 2;

    const green = "#22c55e";
    const darkGreen = "#166534";
    const black = "#1a1a1a";
    const gray = "#6b7280";
    const lightGray = "#9ca3af";
    const borderGray = "#d1d5db";

    doc.rect(0, 0, pageW, pageH).fill("#ffffff");

    const cs = inch(0.45);
    const co = inch(0.25);
    doc.lineWidth(3).strokeColor(green);
    doc.moveTo(co, co + cs).lineTo(co, co).lineTo(co + cs, co).stroke();
    doc.moveTo(pageW - co - cs, co).lineTo(pageW - co, co).lineTo(pageW - co, co + cs).stroke();
    doc.moveTo(co, pageH - co - cs).lineTo(co, pageH - co).lineTo(co + cs, pageH - co).stroke();
    doc.moveTo(pageW - co - cs, pageH - co).lineTo(pageW - co, pageH - co).lineTo(pageW - co, pageH - co - cs).stroke();

    let y = inch(0.5);

    const logoPaths = ["./netlify/functions/assets/logo_nobg.png", "./netlify/functions/assets/logo.png", "./docuproof-logo.png"];
    let logoUsed = null;
    for (const p of logoPaths) { if (fs.existsSync(p)) { logoUsed = p; break; } }
    
    if (logoUsed) {
      const logoSize = inch(0.6);
      const pad = inch(0.04);
      const bgSize = logoSize + pad * 2;
      doc.roundedRect(centerX - bgSize/2, y, bgSize, bgSize, 5).fill("#0a0d10");
      doc.image(logoUsed, centerX - logoSize/2, y + pad, { width: logoSize, height: logoSize });
      y += bgSize + inch(0.1);
    }

    doc.font("Helvetica-Bold").fontSize(18).fillColor(green);
    doc.text("docuProof", marginL, y, { width: contentW, align: "center" });
    y += inch(0.22);

    doc.font("Helvetica-Oblique").fontSize(9).fillColor(gray);
    doc.text("Proof you can point to.", marginL, y, { width: contentW, align: "center" });
    y += inch(0.2);

    doc.circle(centerX - 18, y, 2.5).fill(green);
    doc.circle(centerX, y, 2.5).fill(green);
    doc.circle(centerX + 18, y, 2.5).fill(green);
    y += inch(0.22);

    doc.font("Helvetica").fontSize(9).fillColor(gray);
    doc.text("CERTIFICATE OF", marginL, y, { width: contentW, align: "center", characterSpacing: 2 });
    y += inch(0.18);

    doc.font("Helvetica-Bold").fontSize(22).fillColor(black);
    doc.text("PROOF OF EXISTENCE", marginL, y, { width: contentW, align: "center" });
    y += inch(0.24);

    doc.font("Helvetica").fontSize(8).fillColor(lightGray);
    doc.text("Blockchain-Anchored Timestamp", marginL, y, { width: contentW, align: "center" });
    y += inch(0.28);

    const boxL = marginL + inch(0.1);
    const boxW = contentW - inch(0.2);
    const boxH = inch(1.35);
    const boxTop = y;

    doc.lineWidth(1).strokeColor(borderGray).rect(boxL, boxTop, boxW, boxH).stroke();
    doc.rect(boxL, boxTop, boxW, inch(0.28)).fill("#f8f9fa");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(darkGreen);
    doc.text("DOCUMENT DETAILS", boxL + inch(0.18), boxTop + inch(0.08));

    const lblX = boxL + inch(0.18);
    const valX = boxL + inch(1.15);
    let rowY = boxTop + inch(0.4);
    const rowH = inch(0.22);
    const blockDisplay = blockHeight ? `#${blockHeight}` : "Pending confirmation";

    const rows = [["Proof ID:", id], ["Document:", display], ["Timestamp:", formatDate(createdAt)], ["Block:", blockDisplay]];
    for (const [lbl, val] of rows) {
      doc.font("Helvetica").fontSize(9).fillColor(gray).text(lbl, lblX, rowY);
      doc.font("Helvetica-Bold").fontSize(9).fillColor(black).text(val, valX, rowY, { width: boxW - inch(2.4) });
      rowY += rowH;
    }

    const qrS = inch(0.88);
    const qrX = boxL + boxW - qrS - inch(0.12);
    const qrY = boxTop + inch(0.35);
    const qrPng = await QRCode.toBuffer(verifyUrl, { width: 176, margin: 0, color: { dark: "#1a1a1a", light: "#ffffff" }, errorCorrectionLevel: "M" });
    doc.image(qrPng, qrX, qrY, { width: qrS });
    doc.font("Helvetica-Bold").fontSize(6).fillColor(black).text("SCAN TO VERIFY", qrX, qrY + qrS + inch(0.02), { width: qrS, align: "center" });

    y = boxTop + boxH + inch(0.12);

    if (hash) {
      const hH = inch(0.45);
      doc.lineWidth(1).strokeColor(borderGray).rect(boxL, y, boxW, hH).stroke();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(darkGreen).text("CRYPTOGRAPHIC FINGERPRINT (SHA-256)", boxL + inch(0.18), y + inch(0.08));
      doc.font("Helvetica").fontSize(6.5).fillColor(black).text(hash, boxL + inch(0.18), y + inch(0.26), { width: boxW - inch(0.36) });
      y += hH + inch(0.1);
    }

    const attH = inch(0.95);
    doc.lineWidth(1).strokeColor(borderGray).rect(boxL, y, boxW, attH).stroke();
    doc.rect(boxL, y, boxW, inch(0.26)).fill("#f8f9fa");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(darkGreen).text("LEGAL ATTESTATION", boxL + inch(0.18), y + inch(0.07));
    
    const attText = "This certificate attests that on the date and time indicated above, a cryptographic hash (SHA-256) of the referenced digital file was computed and submitted to the Bitcoin blockchain via the OpenTimestamps protocol. The blockchain record provides tamper-evident proof that the file existed in its exact form at the timestamp recorded. This proof is independently verifiable by any party using the original file and standard cryptographic tools.";
    doc.font("Helvetica").fontSize(7.5).fillColor(black).text(attText, boxL + inch(0.18), y + inch(0.34), { width: boxW - inch(0.36), lineGap: 0.5 });
    y += attH + inch(0.1);

    const instH = inch(0.8);
    doc.lineWidth(1).strokeColor(borderGray).rect(boxL, y, boxW, instH).stroke();
    doc.rect(boxL, y, boxW, inch(0.26)).fill("#f8f9fa");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(darkGreen).text("HOW TO VERIFY THIS PROOF", boxL + inch(0.18), y + inch(0.07));
    
    const insts = [
      "1. Visit the verification URL or scan the QR code",
      "2. Upload your original file to compute its SHA-256 hash",
      "3. Confirm the hash matches the recorded fingerprint",
      "4. Verify the Bitcoin block confirmation on any block explorer"
    ];
    let iY = y + inch(0.34);
    doc.font("Helvetica").fontSize(7.5).fillColor(black);
    for (const inst of insts) {
      doc.text(inst, boxL + inch(0.18), iY, { width: boxW - inch(0.36), continued: false });
      iY += inch(0.11);
    }

    const footY = pageH - inch(0.38);
    doc.lineWidth(1.5).strokeColor(green).moveTo(centerX - inch(1.8), footY).lineTo(centerX + inch(1.8), footY).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(gray);
    doc.text("docuProof.io  •  Proof of Existence on the Blockchain", marginL, footY + inch(0.08), { width: contentW, align: "center" });

    doc.end();
    const pdf = await done;

    const safeBase = (filename || "document").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
    const outputFilename = `${safeBase}-docuProof-certificate.pdf`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${outputFilename}"`,
        "Cache-Control": "no-store",
        "x-docuproof-version": "proof_pdf v7.3.0",
      },
      body: pdf.toString("base64"),
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

function formatDate(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return isoString; }
}
