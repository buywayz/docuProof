// netlify/functions/proof_pdf.js
// docuProof.io — On-brand PDF proof generator (dark theme, logo header)

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

exports.handler = async (event) => {
  try {
    const { id, filename = "proof.pdf", displayName = "Proof" } = Object.fromEntries(
      new URLSearchParams(event.queryStringParameters || {})
    );

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([1200, 800]);
    const { width, height } = page.getSize();

    // === Brand palette ===
    const brandGreen = rgb(0.086, 1, 0.439); // #16FF70
    const darkBg = rgb(0.04, 0.05, 0.06);
    const panelBg = rgb(0.08, 0.09, 0.1);
    const lightText = rgb(0.9, 0.9, 0.9);
    const grayText = rgb(0.7, 0.7, 0.7);

    // === Load fonts ===
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // === Header section ===
    const headerH = 80;
    page.drawRectangle({
      x: 0,
      y: height - headerH,
      width,
      height: headerH,
      color: darkBg,
    });

    // Try to embed the logo
    let logoBytes = null;
    try {
      const logoPath = path.resolve(__dirname, "assets/logo.png");
      if (fs.existsSync(logoPath)) logoBytes = fs.readFileSync(logoPath);
    } catch (_) {}

    const contentX = 60;

    if (logoBytes) {
      const logoImg = await pdfDoc.embedPng(logoBytes);
      const logoH = 42;
      const logoW = (logoImg.width / logoImg.height) * logoH;
      page.drawImage(logoImg, {
        x: contentX,
        y: height - headerH + (headerH - logoH) / 2,
        width: logoW,
        height: logoH,
      });
      page.drawText("docuProof.io — Proof you can point to.", {
        x: contentX + logoW + 14,
        y: height - headerH + 26,
        size: 18,
        font: fontBold,
        color: brandGreen,
      });
    } else {
      page.drawText("docuProof.io — Proof you can point to.", {
        x: contentX,
        y: height - headerH + 26,
        size: 18,
        font: fontBold,
        color: brandGreen,
      });
    }

    // === Body panel ===
    const panelY = 100;
    const panelH = height - headerH - panelY - 60;
    const panelX = 60;
    const panelW = width - 2 * panelX;

    page.drawRectangle({
      x: panelX,
      y: panelY,
      width: panelW,
      height: panelH,
      color: panelBg,
      borderColor: rgb(0.15, 0.15, 0.15),
      borderWidth: 1,
    });

    const lineH = 26;
    let y = height - headerH - 80;

    const drawLabel = (label, val, color = lightText) => {
      page.drawText(label, {
        x: panelX + 30,
        y,
        size: 12,
        font: fontBold,
        color: brandGreen,
      });
      y -= 18;
      page.drawText(val, {
        x: panelX + 30,
        y,
        size: 12,
        font: fontRegular,
        color,
      });
      y -= lineH;
    };

    page.drawText("Proof you can point to.", {
      x: panelX + 30,
      y: height - headerH - 40,
      size: 22,
      font: fontBold,
      color: lightText,
    });

    drawLabel("Proof ID", id || "—");
    drawLabel("Display Name", displayName);
    drawLabel("File Name", filename);
    drawLabel("Created (UTC)", new Date().toISOString());
    drawLabel("Verification", `https://docuproof.io/verify?id=${id}`);

    // === Footer ===
    const footerY = 40;
    page.drawText(
      "© 2025 docuProof.io — Bitcoin-anchored proof of existence.",
      { x: panelX, y: footerY, size: 10, font: fontRegular, color: grayText }
    );

    const pdfBytes = await pdfDoc.save();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
      },
      body: pdfBytes.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};