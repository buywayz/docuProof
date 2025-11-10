// netlify/functions/proof_pdf_new.js
// docuProof.io — PDF certificate (dark theme, transparent logo, QR code)
// Emits an identifying header so we can verify we're on the new path.

const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const QRCode = require("qrcode");

const LOGO_PATH = path.join(__dirname, "assets", "logo.png"); // transparent PNG we created
const FONT_SANS = path.join(__dirname, "fonts", "SFNS.ttf");  // optional; falls back to Helvetica

exports.handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const proofId     = (qs.get("id") || "—").trim();
    const fileName    = (qs.get("filename") || "Launch-Test.pdf").trim();
    const displayName = (qs.get("displayName") || "Launch Sync Test").trim();
    const quickId     = (qs.get("quick") || "").trim();

    // Brand palette
    const green  = rgb(0x16/255, 0xFF/255, 0x70/255); // #16FF70
    const txt    = rgb(0.90, 0.92, 0.94);
    const txt2   = rgb(0.70, 0.74, 0.78);
    const bg1    = rgb(0.05, 0.06, 0.07);
    const headBg = rgb(0.06, 0.07, 0.08);

    // Canvas
    const W = 1200, H = 800;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([W, H]);

    // Fonts
    let fontSans;
    try {
      const fontBuf = fs.readFileSync(FONT_SANS);
      fontSans = await pdf.embedFont(fontBuf);
    } catch {
      fontSans = await pdf.embedFont(StandardFonts.Helvetica);
    }
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Background + header
    page.drawRectangle({ x:0, y:0, width:W, height:H, color:bg1 });
    const HEADER_H = 84;
    page.drawRectangle({ x:0, y:H-HEADER_H, width:W, height:HEADER_H, color:headBg });

    // Logo (transparent PNG, no framing box)
    let lx = 24, ly = H - HEADER_H + 12, LSIZE = 60;
    try {
      const logoBytes = fs.readFileSync(LOGO_PATH);
      const logo = await pdf.embedPng(logoBytes); // embeds with alpha → no box
      const ratio = logo.height / logo.width;
      const w = LSIZE, h = Math.round(LSIZE * ratio);
      page.drawImage(logo, { x: lx, y: ly + (HEADER_H - h)/2, width: w, height: h, opacity: 1.0 });
      lx += w + 16;
    } catch { /* logo optional */ }

    // Header title
    const title = "docuProof.io — Proof you can point to.";
    page.drawText(title, { x: lx, y: H - 56, size: 28, font: fontBold, color: green });

    // Content block
    const pad = 56, top = H - 140;
    let y = top, lh = 32;

    const label = (t) => page.drawText(t, { x: pad, y: y, size: 16, font: fontBold, color: green });
    const line  = (t) => page.drawText(t, { x: pad + 140, y: y, size: 16, font: fontSans, color: txt });

    // Headline
    page.drawText("Proof you can point to.", { x: pad, y: y + 64, size: 44, font: fontBold, color: txt });

    // Fields
    const rows = [
      ["Proof ID", proofId],
      ["Quick Verify ID", quickId || "—"],
      ["Created (UTC)", new Date().toISOString()],
      ["File Name", fileName],
      ["Display Name", displayName],
      ["Verification", ""],
    ];

    y -= 16;
    for (const [k, v] of rows) {
      y -= lh;
      label(k);
      line(v);
    }

    // Public Verify URL (used for QR)
    const verifyUrl = qs.get("verifyUrl")
      || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;
    y -= lh;
    label("Public Verify URL");
    line(verifyUrl);

    // QR code (bottom-right)
    try {
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, errorCorrectionLevel: "M" });
      const base64 = qrDataUrl.replace(/^data:image\/png;base64,/, "");
      const qr = await pdf.embedPng(Buffer.from(base64, "base64"));
      const QR = 180;
      page.drawImage(qr, { x: W - pad - QR, y: pad + 8, width: QR, height: QR, opacity: 1.0 });
      // Caption
      page.drawText("Scan to verify", { x: W - pad - QR, y: pad - 14, size: 12, font: fontSans, color: txt2 });
    } catch { /* QR optional */ }

    // Footer
    page.drawText("© 2025 docuProof.io — All rights reserved.", {
      x: pad, y: pad - 6, size: 12, font: fontSans, color: txt2
    });

    const bytes = await pdf.save();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="docuProof-Certificate.pdf"',
        "Cache-Control": "no-cache",
        // verification header so we can prove we’re on the new function
        "X-DocuProof-Function": "proof_pdf_new",
      },
      body: Buffer.from(bytes).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok:false, error: String(err && err.stack || err) }),
    };
  }
};