// proof_pdf.js — v5.2.0 (layout tuning)

const PDFDocument = require("pdfkit");
const fs = require("fs");
const QRCode = require("qrcode");

exports.handler = async (event) => {
  try {
    const { id, filename, displayName, verifyUrl, quickId } = event.queryStringParameters;

    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: "docuProof Certificate" },
    });

    let buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    const finish = new Promise((r) => doc.on("end", () => r(Buffer.concat(buffers))));

    // Background
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0b0d0f");

    // Header text
    doc.fontSize(22).fillColor("#16FF70").font("Helvetica-Bold").text("docuProof.io — Proof you can point to.", 48, 48);

    // Logo
    const logoPath = "./netlify/functions/assets/logo_nobg.png";
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, doc.page.width - 200, 36, { width: 120 });
    }

    // Divider
    doc.moveTo(48, 100).lineTo(doc.page.width - 48, 100).strokeColor("#1a1f24").opacity(0.5).stroke().opacity(1);

    // Main section
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#E6E7EB").text("Proof you can point to.", 48, 130);
    doc.font("Helvetica").fontSize(10).fillColor("#A0A0A0").text(
      "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
      48, 155, { width: 500 }
    );

    // Proof Summary
    doc.moveDown(1.2);
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#16FF70").text("Proof Summary", 48);

    const summary = [
      ["Proof ID", id],
      ["Quick Verify ID", quickId],
      ["Created (UTC)", new Date().toISOString()],
      ["File Name", filename],
      ["Display Name", displayName],
      ["Verification", `https://docuproof.io/verify?id=${id}`],
    ];

    doc.moveDown(0.3);
    summary.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#16FF70").text(label, { continued: true });
      doc.font("Helvetica").fillColor("#E6E7EB").text(` ${value}`);
    });

    // QR Code
    const qrPng = await QRCode.toDataURL(verifyUrl, { width: 160, margin: 0, color: { dark: "#16FF70", light: "#0b0d0f" } });
    const qrBuf = Buffer.from(qrPng.split(",")[1], "base64");
    doc.image(qrBuf, doc.page.width - 220, 220, { width: 140 });

    // Footer
    doc.fontSize(8).fillColor("#555").text(
      "docuProof batches proofs to Bitcoin for tamper-evident timestamping.\n© 2025 docuProof.io — All rights reserved.",
      48, doc.page.height - 72,
      { width: doc.page.width - 96, align: "center" }
    );

    doc.end();
    const pdf = await finish;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
      body: pdf.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message, stack: err.stack }) };
  }
};
