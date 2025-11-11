// netlify/functions/proof_pdf.js
// v4.4.1 — dual-path asset lookup, trace headers, bigger QR, transparent PNG support
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const HEADERS_NO_CACHE = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function firstExisting(paths) {
  for (const p of paths) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

async function embedPngIfExists(pdfDoc, p) {
  if (!p) return null;
  try {
    const bytes = fs.readFileSync(p);
    return await pdfDoc.embedPng(bytes);
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  const trace = {
    version: "proof_pdf v4.4.1 dual-path-logo + bigger-qr",
    qr: 0,
    logo: 0,
    logo_src: "none",
    path_try: [],
    path_hit: "none",
    err: "",
  };

  try {
    const q = (event && event.queryStringParameters) || {};
    const id          = q.id || "unknown";
    const filename    = (q.filename || "Proof.pdf").replace(/"/g, "");
    const displayName = q.displayName || "Document Proof";
    const quickId     = q.quickId || "";
    const verifyUrl   = (q.verifyUrl && q.verifyUrl.trim())
      ? q.verifyUrl
      : "https://docuproof.io/verify?id=" + encodeURIComponent(id);

    // Prepare PDF
    const pdfDoc = await PDFDocument.create();
    const W = 1200, H = 630;
    const page = pdfDoc.addPage([W, H]);

    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const charcoal = rgb(0x0b/255, 0x0d/255, 0x0f/255);
    const graphite = rgb(0x1a/255, 0x1f/255, 0x24/255);
    const neon     = rgb(0x16/255, 0xFF/255, 0x70/255);
    const white    = rgb(0xE6/255, 0xE7/255, 0xEB/255);

    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: charcoal });
    page.drawRectangle({ x: 60, y: 60, width: W - 120, height: H - 120, borderColor: graphite, borderWidth: 1, opacity: 0.6 });

    const title = "Proof you can point to.";
    const tSize = 64;
    const tWidth = helvBold.widthOfTextAtSize(title, tSize);
    page.drawText(title, { x: (W - tWidth) / 2, y: H - 370, size: tSize, font: helvBold, color: neon });

    const subtitle = "Because memory is fallible - timestamps aren't.";
    const sSize = 40;
    const sWidth = helvBold.widthOfTextAtSize(subtitle, sSize);
    page.drawText(subtitle, { x: (W - sWidth) / 2, y: H - 405, size: sSize, font: helvBold, color: white });

    // ── Logo (dual-path lookup: /assets/* or /netlify/functions/assets/*) ──
    const candidates_nobg = [
      path.join(__dirname, "assets", "logo_nobg.png"),
      path.join(__dirname, "netlify", "functions", "assets", "logo_nobg.png"),
    ];
    const candidates_png = [
      path.join(__dirname, "assets", "logo.png"),
      path.join(__dirname, "netlify", "functions", "assets", "logo.png"),
    ];
    trace.path_try = [...candidates_nobg, ...candidates_png];

    let logoPath = firstExisting(candidates_nobg);
    let logoImg = await embedPngIfExists(pdfDoc, logoPath);
    if (!logoImg) {
      logoPath = firstExisting(candidates_png);
      logoImg = await embedPngIfExists(pdfDoc, logoPath);
      if (logoImg) trace.logo_src = path.basename(logoPath) || "logo.png";
    } else {
      trace.logo_src = "logo_nobg.png";
    }
    trace.path_hit = logoPath || "none";

    if (logoImg) {
      const targetW = 200;
      const scale = targetW / logoImg.width;
      const targetH = logoImg.height * scale;
      const margin = 60;
      const x = margin + 8;
      const y = H - margin - targetH - 8;
      page.drawImage(logoImg, { x, y, width: targetW, height: targetH });
      trace.logo = 1;
    }

    // ── Summary block ──
    const left = 100; let y = 250; const lh = 26;
    const label = (t, yy) => page.drawText(t, { x: left, y: yy, size: 14, font: helv, color: white, opacity: 0.7 });
    const value = (t, yy) => page.drawText(t, { x: left + 180, y: yy, size: 16, font: helvBold, color: white });
    label("Display Name", y);   value(displayName, y);   y -= lh;
    label("Document ID", y);    value(id, y);            y -= lh;
    label("Quick ID", y);       value(quickId || "—", y);y -= lh;
    label("Verify URL", y);     value(verifyUrl, y);     y -= lh;

    // ── QR (bigger, raised) ──
    try {
      const dataUrl = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: "M",
        margin: 0,
        color: { dark: "#16FF70", light: "#00000000" },
      });
      const b64 = dataUrl.split(",")[1];
      const qrPng = Buffer.from(b64, "base64");
      const qrImg = await pdfDoc.embedPng(qrPng);

      const size = 220;    // larger
      const margin = 60;
      const x = W - margin - size;
      const y = margin + 40; // lift off bottom
      page.drawImage(qrImg, { x, y, width: size, height: size });
      trace.qr = 1;
    } catch {
      trace.qr = -1;
    }

    // Footer helper
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
        // debug paths
        "X-DocuProof-Logo-Path": trace.path_hit,
        "X-DocuProof-Logo-Tried": trace.path_try.join(" | "),
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
        "X-DocuProof-Version": "proof_pdf v4.4.1 (exception)",
        "X-DocuProof-Error": msg.slice(0, 200),
      },
      body: JSON.stringify({ error: "PDF generation failed" }),
    };
  }
};