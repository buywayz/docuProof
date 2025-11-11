// netlify/functions/proof_pdf.js
// v5.2.1 — clean binary output + refined layout + QR + logo

const PDFDocument = require("pdfkit");
const fs = require("fs");
const QRCode = require("qrcode");

exports.handler = async (event) => {
  try {
    const { id, filename, displayName, verifyUrl, quickId } = event.queryStringParameters;

    // --- Create PDF doc ---
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      info: { Title: "docuProof Certificate" },
    });

    let buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    const finish = new Promise((resolve) => doc.on("end", () => resolve(Buffer.concat(buffers))));

    // --- Background ---
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#0b0d0f");

    // --- Header ---
    doc
      .fontSize(20)
      .fillColor("#16FF70")
      .font("Helvetica-Bold")
      .text("docuProof.io — Proof you can point to.", 48, 48);

    // --- Logo ---
    const logoPath = "./netlify/functions/assets/logo_nobg.png";
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, doc.page.width - 180, 42, { width: 110 });
    }

    // --- Divider line ---
    doc
      .moveTo(48, 100)
      .lineTo(doc.page.width - 48, 100)
      .strokeColor("#1a1f24")
      .opacity(0.5)
      .stroke()
      .opacity(1);

    // --- Title ---
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor("#E6E7EB")
      .text("Proof you can point to.", 48, 125);

    // --- Description ---
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#A0A0A0")
      .text(
        "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
        48,
        145,
        { width: 480 }
      );

    // --- Proof Summary ---
    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#16FF70").text("Proof Summary", 48);

    const summary = [
      ["Proof ID", id],
      ["Quick Verify ID", quickId],
      ["Created (UTC)", new Date().toISOString()],
      ["File Name", filename],
      ["Display Name", displayName],
      ["Verification URL", `https://docuproof.io/verify?id=${id}`],
    ];

    doc.moveDown(0.3);
    summary.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#16FF70").text(label, { continued: true });
      doc.font("Helvetica").fillColor("#E6E7EB").text(` ${value}`);
    });

    // --- QR Code ---
    const qrPng = await QRCode.toDataURL(verifyUrl, {
      width: 140,
      margin: 0,
      color: { dark: "#16FF70", light: "#0b0d0f" },
    });
    const qrBuf = Buffer.from(qrPng.split(",")[1], "base64");
    doc.image(qrBuf, doc.page.width - 200, 220, { width: 120 });

    // --- Footer ---
    doc
      .fontSize(7.5)
      .fillColor("#555")
      .text(
        "docuProof batches proofs to Bitcoin for tamper-evident timestamping.\n© 2025 docuProof.io — All rights reserved.",
        48,
        doc.page.height - 70,
        { width: doc.page.width - 96, align: "center" }
      );

    // --- Finish ---
    doc.end();
    const pdfBuffer = await finish;

    // --- Binary-safe output ---
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=\"${filename}\"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Content-Transfer-Encoding": "binary",
        "Accept-Ranges": "bytes",
      },
      body: pdfBuffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message, stack: err.stack }),
    };
  }
};