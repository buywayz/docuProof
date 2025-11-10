// netlify/functions/proof_pdf.js
// v4.2: Vector-drawn QR (no image); fetch PNG logo over HTTPS to preserve alpha.
// Deps: pdf-lib; (no qrcode image embedding needed; using matrix + rectangles)
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// Use the "qrcode" package only to compute the matrix, not to render an image.
const QRCode = require('qrcode');

const HEADERS_NO_CACHE = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

exports.handler = async (event) => {
  const trace = {
    version: 'proof_pdf v4.2: vector-qr + https-logo',
    qr: 0,               // 1 ok, 0 skipped, -1 fail
    logo: 0,             // 1 ok, 0 missing, -1 fail
    logo_src: 'none',
    err: '',
  };

  try {
    // ---------- Safe query params ----------
    const qp = event && event.queryStringParameters ? event.queryStringParameters : {};
    const id          = qp.id || 'unknown';
    const filename    = (qp.filename || 'Proof.pdf').replace(/"/g, '');
    const displayName = qp.displayName || 'Document Proof';
    const quickId     = qp.quickId || '';
    const verifyUrl   = (qp.verifyUrl && qp.verifyUrl.trim())
      ? qp.verifyUrl
      : `https://docuproof.io/verify?id=${encodeURIComponent(id)}`;

    // ---------- PDF skeleton (preserve look/feel) ----------
    const pdfDoc = await PDFDocument.create();
    const pageWidth = 1200, pageHeight = 630;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const charcoal = rgb(0x0b/255, 0x0d/255, 0x0f/255);
    const graphite = rgb(0x1a/255, 0x1f/255, 0x24/255);
    const neon     = rgb(0x16/255, 0xFF/255, 0x70/255);
    const white    = rgb(0xE6/255, 0xE7/255, 0xEB/255);

    // Background + frame
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: charcoal });
    page.drawRectangle({ x: 60, y: 60, width: pageWidth - 120, height: pageHeight - 120, borderColor: graphite, borderWidth: 1, opacity: 0.6 });

    // Title + subtitle (centered)
    const title = 'Proof you can point to.';
    const titleSize = 64;
    const titleWidth = helvBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, { x: (pageWidth - titleWidth) / 2, y: 630 - 370, size: titleSize, font: helvBold, color: neon });

    const subtitle = 'Because memory is fallible—timestamps aren’t.';
    const subSize = 40;
    const subWidth = helvBold.widthOfTextAtSize(subtitle, subSize);
    page.drawText(subtitle, { x: (pageWidth - subWidth) / 2, y: 630 - 335, size: subSize, font: helvBold, color: white });

    // -------------------- LOGO (HTTPS fetch to avoid stale bundle) --------------------
    // Preferred public path (adjust if your asset URL differs):
    // e.g., https://docuproof.io/assets/logo_nobg.png
    const PUBLIC_LOGO_URL = qp.logoUrl || 'https://docuproof.io/assets/logo_nobg.png';

    try {
      // Node 18+ on Netlify exposes global fetch.
      const res = await fetch(PUBLIC_LOGO_URL, { redirect: 'follow' });
      if (res.ok) {
        const arr = new Uint8Array(await res.arrayBuffer());
        const logoImg = await pdfDoc.embedPng(arr); // preserves alpha
        const logoW = 200;
        const scale = logoW / logoImg.width;
        const logoH = logoImg.height * scale;
        const margin = 60;
        const logoX = margin + 8;
        const logoY = pageHeight - margin - logoH - 8;
        page.drawImage(logoImg, { x: logoX, y: logoY, width: logoW, height: logoH });
        trace.logo = 1;
        trace.logo_src = PUBLIC_LOGO_URL;
      } else {
        trace.logo = 0; trace.logo_src = `fetch-failed:${res.status}`;
      }
    } catch {
      // Fallback to bundled assets if HTTPS fetch fails
      let logoBytes = null;
      const tryPaths = [
        path.join(__dirname, 'assets', 'logo_nobg.png'),
        path.join(__dirname, 'assets', 'logo.png'),
      ];
      for (const p of tryPaths) {
        try { if (fs.existsSync(p)) { logoBytes = fs.readFileSync(p); trace.logo_src = path.basename(p); break; } } catch {}
      }
      if (logoBytes) {
        try {
          const logoImg = await pdfDoc.embedPng(logoBytes);
          const logoW = 200;
          const scale = logoW / logoImg.width;
          const logoH = logoImg.height * scale;
          const margin = 60;
          const logoX = margin + 8;
          const logoY = pageHeight - margin - logoH - 8;
          page.drawImage(logoImg, { x: logoX, y: logoY, width: logoW, height: logoH });
          trace.logo = 1;
        } catch { trace.logo = -1; }
      } else {
        trace.logo = 0;
      }
    }

    // ------------------- Proof summary (concise) --------------------
    const left = 100; let y = 250; const lineH = 26;
    const label = (t, yy) => page.drawText(t, { x: left, y: yy, size: 14, font: helv, color: white, opacity: 0.7 });
    const value = (t, yy) => page.drawText(t, { x: left + 180, y: yy, size: 16, font: helvBold, color: white });

    label('Display Name', y);   value(displayName, y);   y -= lineH;
    label('Document ID', y);    value(id, y);            y -= lineH;
    label('Quick ID', y);       value(quickId || '—', y);y -= lineH;
    label('Verify URL', y);     value(verifyUrl, y);     y -= lineH;

    // -------------------- QR CODE (VECTOR, no images) --------------------
    // Build the QR matrix and draw each dark module as a tiny square.
    try {
      const qr = QRCode.create(verifyUrl, { errorCorrectionLevel: 'M' });
      const modules = qr.modules;
      const size = modules.size;
      const qrSizePx = 120;          // final on-page size
      const margin = 60;
      const qrX = pageWidth - margin - qrSizePx;
      const qrY = margin;
      const cell = qrSizePx / size;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (modules.get(c, r)) {
            // draw a module square; +0.5/-1 to reduce alias seams
            page.drawRectangle({
              x: qrX + c * cell,
              y: qrY + (size - 1 - r) * cell, // invert Y to PDF coords
              width: Math.ceil(cell),
              height: Math.ceil(cell),
              color: white,  // visible on charcoal
            });
          }
        }
      }
      trace.qr = 1;
    } catch {
      trace.qr = -1;
    }

    // Footer hint
    page.drawText('Scan the QR or visit the Verify URL to view anchor status and confir