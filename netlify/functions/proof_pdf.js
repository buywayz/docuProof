// netlify/functions/proof_pdf.js
// v5.1.1 — stable PDFKit build with transparent QR + logo_nobg fallback
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

exports.handler = async (event) => {
  // -------- parse inputs --------
  const q = event.queryStringParameters || {};
  const proofId     = (q.id || "diag").toString();
  const fileName    = (q.filename || "Proof.pdf").toString();
  const displayName = (q.displayName || "Proof you can point to.").toString();
  const verifyUrl   = (q.verifyUrl || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`).toString();
  const quickId     = (q.quickId || (proofId.slice(0,10) || "quick12345")).toString();

  // -------- resolve logo path(s) --------
  const cwd = process.cwd(); // on Netlify: /var/task
  // search order (first existing wins)
  const logoCandidates = [
    path.join(cwd, "netlify/functions/assets/logo_nobg.png"),
    path.join(cwd, "netlify/functions/netlify/functions/assets/logo_nobg.png"),
    path.join(cwd, "netlify/functions/assets/logo.png"),
    path.join(cwd, "netlify/functions/netlify/functions/assets/logo.png"),
  ];

  let logoPath = null;
  for (const p of logoCandidates) {
    try { fs.accessSync(p, fs.constants.R_OK); logoPath = p; break; } catch {}
  }

  // -------- build QR (transparent bg) --------
  let qrPngBuffer = null;
  try {
    qrPngBuffer = await QRCode.toBuffer(verifyUrl, {
      type: "png",
      width: 220,
      margin: 0,
      color: { dark: "#000000", light: "#00000000" } // transparent light modules
    });
  } catch (e) {
    return jsonError(500, "QR generation failed", e);
  }

  // -------- render PDF with PDFKit --------
  try {
    const pdf = new PDFDocument({ size: "LETTER", margins: { top: 56, left: 56, bottom: 56, right: 56 } });

    const chunks = [];
    pdf.on("data", (d) => chunks.push(d));
    const pdfDone = new Promise((resolve) => pdf.on("end", () => resolve(Buffer.concat(chunks))));

    // background
    pdf.rect(0, 0, pdf.page.width, pdf.page.height).fill("#0b0d0f");
    // card surface
    pdf.save();
    pdf.fillColor("#11161a").roundedRect(28, 84, pdf.page.width - 56, pdf.page.height - 168, 8).fill();
    pdf.restore();

    // header row with logo (if present) + title
    const headerY = 32;
    if (logoPath) {
      // show small logo in nav
      pdf.image(logoPath, 28, headerY, { width: 32 });
    }
    pdf.fillColor("#16FF70").font("Helvetica-Bold").fontSize(18)
       .text("docuProof.io — Proof you can point to.", logoPath ? 72 : 28, headerY + 4);

    // title
    pdf.fillColor("#E6E7EB").font("Helvetica-Bold").fontSize(28)
       .text("Proof you can point to.", 48, 108);

    // left column: summary text
    const xLeft = 64, yTop = 152, lh = 20;
    pdf.font("Helvetica-Bold").fontSize(14).fillColor("#16FF70").text("Proof Summary", xLeft, yTop);

    pdf.font("Helvetica-Bold").fontSize(12).fillColor("#86A3B9").text("Proof ID", xLeft, yTop + lh*2);
    pdf.font("Helvetica").fillColor("#E6E7EB").text(proofId, xLeft, yTop + lh*3);

    pdf.font("Helvetica-Bold").fillColor("#86A3B9").text("Quick Verify ID", xLeft, yTop + lh*5);
    pdf.font("Helvetica").fillColor("#E6E7EB").text(quickId, xLeft, yTop + lh*6);

    const createdAt = new Date().toISOString().replace("T", " ").replace("Z","");
    pdf.font("Helvetica-Bold").fillColor("#86A3B9").text("Created (UTC)", xLeft, yTop + lh*8);
    pdf.font("Helvetica").fillColor("#E6E7EB").text(createdAt, xLeft, yTop + lh*9);

    pdf.font("Helvetica-Bold").fillColor("#86A3B9").text("File Name", xLeft, yTop + lh*11);
    pdf.font("Helvetica").fillColor("#E6E7EB").text(fileName, xLeft, yTop + lh*12);

    pdf.font("Helvetica-Bold").fillColor("#86A3B9").text("Display Name", xLeft, yTop + lh*14);
    pdf.font("Helvetica").fillColor("#E6E7EB").text(displayName, xLeft, yTop + lh*15);

    pdf.font("Helvetica-Bold").fillColor("#86A3B9").text("Verification", xLeft, yTop + lh*17);
    pdf.font("Helvetica").fillColor("#E6E7EB").text("Public Verify URL", xLeft, yTop + lh*18);
    pdf.fillColor("#9CD8FF").text(verifyUrl, xLeft, yTop + lh*19, { link: verifyUrl, underline: false });

    // right column: logo on card + QR
    const rightX = pdf.page.width - 56 - 240;
    const qrY = yTop + 8;

    // draw large logo on the card (transparent if using *_nobg*)
    if (logoPath) {
      pdf.image(logoPath, rightX, qrY, { width: 220 });
    }

    // QR overlays on lower-right corner of the card
    pdf.image(qrPngBuffer, rightX, qrY + 240, { width: 180 });

    // footer
    pdf.fontSize(9).fillColor("#9aa7b3")
       .text("docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
             48, pdf.page.height - 56);
    pdf.fontSize(9).fillColor("#9aa7b3").text(`© ${new Date().getUTCFullYear()} docuProof.io — All rights reserved.`, 48, pdf.page.height - 40);

    pdf.end();
    const out = await pdfDone;

    // headers for debugging
    const hdrs = {
      "Content-Type": "application/pdf",
      "Cache-Control": "no-cache,no-store,must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
      "Content-Disposition": `inline; filename="${sanitizeFilename(fileName)}"`,
      "x-docuproof-version": "proof_pdf v5.1.1 (pdfkit, vector-qr-png)",
      "x-docuproof-qr": "1",
      "x-docuproof-logo": logoPath ? "1" : "0",
      "x-docuproof-logo-src": logoPath ? path.basename(logoPath) : "MISSING",
      "x-docuproof-logo-path": logoPath || "N/A",
    };

    return {
      statusCode: 200,
      headers: hdrs,
      body: out.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return jsonError(500, "PDF build failed", e);
  }
};

// -------- helpers --------
function sanitizeFilename(s) {
  return String(s).replace(/[^\w.\- ]+/g, "_");
}
function jsonError(code, msg, err) {
  const body = {
    ok: false,
    error: msg,
    detail: err && (err.message || String(err)),
    stack: err && err.stack ? String(err.stack).split("\n").slice(0,4) : undefined,
  };
  return {
    statusCode: code,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      "x-docuproof-version": "proof_pdf v5.1.1 (exception)",
    },
    body: JSON.stringify(body),
  };
}