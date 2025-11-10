// netlify/functions/proof_pdf.js
// v4.4.0: ASCII-clean. Logo fallback + PNG-embedded QR (neon on transparent).
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const HEADERS_NO_CACHE = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

exports.handler = async (event) => {
  const trace = {
    version: "proof_pdf v4.4.0 png-qr + logo-fallback",
    qr: 0,
    qr_method: "png",
    logo: 0,
    logo_src: "none",
    err: "",
  };

  try {
    const qp = (event && event.queryStringParameters) ? event.queryStringParameters : {};
    const id          = qp.id || "unknown";
    const filename    = (qp.filename || "Proof.pdf").replace(/"/g, "");
    const displayName = qp.displayName || "Document Proof";
    const quickId     = qp.quickId || "";
    const verifyUrl   = (qp.verifyUrl && qp.verifyUrl.trim())
      ? qp.verifyUrl
      : "https://docuproof.io/verify?id=" + encodeURIComponent(id);

    const pdfDoc = await PDFDocument.create();
    const pageWidth = 1200, pageHeight = 630;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const charcoal = rgb(0x0b/255, 0x0d/255, 0x0f/255);
    const graphite = rgb(0x1a/255, 0x1f/255, 0x24/255);
    const neon     = rgb(0x16/255, 0xFF/255, 0x70/255);
    const white    = rgb(0xE6/255, 0xE7/255, 0xEB/255);

    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: charcoal });
    page.drawRectangle({ x: 60, y: 60, width: pageWidth - 120, height: pageHeight - 120, borderColor: graphite, borderWidth: 1, opacity: 0.6 });

    const title = "Proof you can point to.";
    const titleSize = 64;
    const titleWidth = helvBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, { x: (pageWidth - titleWidth) / 2, y: pageHeight - 370, size: titleSize, font: helvBold, color: neon });

    const subtitle = "Because memory is fallible - timestamps aren't.";
    const subSize = 40;
    const subWidth = helvBold.widthOfTextAtSize(subtitle, subSize);
    page.drawText(subtitle, { x: (pageWidth - subWidth) / 2, y: pageHeight - 405, size: subSize, font: helvBold, color: white });

    // Logo (prefer transparent, fallback to opaque)
    const tryEmbedLogo = async (p) => {
      if (!fs.existsSync(p)) return null;
      const bytes = fs.readFileSync(p);
      try { return await pdfDoc.embedPng(bytes); } catch { return null; }
    };

    let logoPath = path.join(__dirname, "assets", "logo_nobg.png");
    let logoImg = await tryEmbedLogo(logoPath);
    if (!logoImg) {
      logoPath = path.join(__dirname, "assets", "logo.png");
      if (fs.existsSync(logoPath)) {
        const bytes = fs.readFileSync(logoPath);
        try { logoImg = await pdfDoc.embedPng(bytes); } catch { logoImg = null; }
        if (logoImg) trace.logo_src = "logo.png";
      }
    } else {
      trace.logo_src = "logo_nobg.png";
    }

    if (logoImg) {
      const logoW = 200;
      const scale = logoW / logoImg.width;
      const logoH = logoImg.height * scale;
      const margin = 60;
      const logoX = margin + 8;
      const logoY = pageHeight - margin - logoH - 8;
      page.drawImage(logoImg, { x: logoX, y: logoY, width: logoW, height: logoH });
      trace.logo = 1;
    }

    // Summary
    const left = 100; let y = 250; const lineH = 26;
    const label = (t, yy) => page.drawText(t, { x: left, y: yy, size: 14, font: helv, color: white, opacity: 0.7 });
    const value = (t, yy) => page.drawText(t, { x: left + 180, y: yy, size: 16, font: helvBold, color: white });
    label("Display Name", y);   value(displayName, y);   y -= lineH;
    label("Document ID", y);    value(id, y);            y -= lineH;
    label("Quick ID", y);       value(quickId || "—", y);y -= lineH;
    label("Verify URL", y);     value(verifyUrl, y);     y -= lineH;

    // QR as PNG (visible neon, no margins)
    try {
      const dataUrl = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: "M",
        margin: 0,
        color: { dark: "#16FF70", light: "#00000000" }
      });
      const b64 = dataUrl.split(",")[1];
      const qrPng = Buffer.from(b64, "base64");
      const qrImg = await pdfDoc.embedPng(qrPng);

      const qrSize = 200;
      const margin = 60;
      const qrX = pageWidth - margin - qrSize;
      const qrY = margin;

      page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
      trace.qr = 1;
    } catch {
      trace.qr = -1;
    }

    page.drawText("Scan the QR or visit the Verify URL to view anchor status and confirmations.", {
      x: 100, y: 100, size: 12, font: helv, color: white, opacity: 0.8,
    });

    const pdfBytes = await pdfDoc.save();
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...HEADERS_NO_CACHE,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "X-DocuProof-Version": trace.version,
        "X-DocuProof-QR": String(trace.qr),
        "X-DocuProof-Logo": String(trace.logo),
        "X-DocuProof-Logo-Src": trace.logo_src,
      },
      body: Buffer.from(pdfBytes).toString("base64"),
    };
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err || "");
    return {
      statusCode: 500,
      headers: {
        ...HEADERS_NO_CACHE,
        "Content-Type": "application/json",
        "X-DocuProof-Version": "proof_pdf v4.4.0 (exception)",
        "X-DocuProof-Error": msg.slice(0, 200),
      },
      body: JSON.stringify({ error: "PDF generation failed" }),
    };
  }
};