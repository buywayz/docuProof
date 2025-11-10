// netlify/functions/proof_pdf.js
// docuProof.io — add compact QR code (no layout changes)

const fs = require("fs");
const path = require("path");
const QR = require("qrcode");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

exports.handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const proofId     = (qs.get("id") || "—").trim();
    const fileName    = (qs.get("filename") || "—").trim();
    const displayName = (qs.get("displayName") || "—").trim();
    const verifyUrl   = (qs.get("verifyUrl") || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`).trim();
    const quickId     = (qs.get("quickId") || "—").trim();

    const W = 1200, H = 800;

    const neon = rgb(0x16/255, 0xFF/255, 0x70/255);
    const bg   = rgb(0.05, 0.06, 0.07);
    const head = rgb(0.06, 0.07, 0.08);
    const panel = rgb(0.10, 0.11, 0.12);
    const txt  = rgb(0.90, 0.92, 0.94);
    const sub  = rgb(0.70, 0.74, 0.78);

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([W, H]);
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Background & header bar
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bg });
    const HEADER_H = 84;
    page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: head });

    // Transparent logo
    const logoPath = path.join(__dirname, "assets", "logo.png");
    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath);
      const logoImg = await pdf.embedPng(logoBytes);
      const logoH = 48;
      const aspect = logoImg.width / logoImg.height;
      const logoW = logoH * aspect;
      page.drawImage(logoImg, {
        x: 56,
        y: H - HEADER_H + (HEADER_H - logoH) / 2,
        width: logoW,
        height: logoH
      });
    }

    // Header title
    page.drawText("docuProof.io — Proof you can point to.", {
      x: 56 + 56,
      y: H - 54,
      size: 28,
      font: helvBold,
      color: neon
    });

    // Draw everything else exactly as you already have
    // ...
    // (No edits to text, fields, fonts, or layout)

    // --- Compact QR code (≈140px) ---
    if (verifyUrl && verifyUrl.startsWith("http")) {
      const qrDataUrl = await QR.toDataURL(verifyUrl, {
        errorCorrectionLevel: "M",
        margin: 1,
        scale: 6,
        color: { dark: "#000000", light: "#FFFFFF00" }
      });
      const qrBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
      const qrImg = await pdf.embedPng(qrBytes);
      const qrSide = 140;
      const qrX = W - qrSide - 60;
      const qrY = 60;
      page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSide, height: qrSide });
    }

    const pdfBytes = await pdf.save();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="docuProof-Certificate.pdf"',
        "Cache-Control": "no-cache"
      },
      body: Buffer.from(pdfBytes).toString("base64"),
      isBase64Encoded: true
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};