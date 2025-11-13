// netlify/functions/proof_pdf.js
// v4: Fix QR visibility + enforce transparent logo embedding + trace headers
// Requires: pdf-lib, qrcode
// Assets expected:
//   netlify/functions/assets/logo_nobg.png (preferred, transparent)
//   netlify/functions/assets/logo.png      (fallback)

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const HEADERS_NO_CACHE = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

exports.handler = async (event) => {
  const trace = {
    version: 'proof_pdf v4: qr+logo fixes',
    qr: 0,
    logo: 0,
    logo_src: 'none',
  };

  try {
    // -------- Parse query params (compat with current calls) --------
    const url = new URL(event.rawUrl || `http://localhost${event.path}${event.queryString ? '?' + event.queryString : ''}`);
    const qp = Object.fromEntries(url.searchParams.entries());

    const id          = qp.id || 'unknown';
    const filename    = qp.filename || 'Proof.pdf';
    const displayName = qp.displayName || 'Document Proof';
    const verifyUrl   = qp.verifyUrl || `https://docuproof.io/verify?id=${encodeURIComponent(id)}`;
    const quickId     = qp.quickId || '';

    // ----------------------------------------------------------------
    // PDF doc + page (keep your existing 1200×630 canvas that matches
    // current typography/spacing; do not alter hierarchy or palette).
    // ----------------------------------------------------------------
    const pdfDoc = await PDFDocument.create();
    const pageWidth = 1200;
    const pageHeight = 630;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Fonts — Helvetica / Helvetica-Bold (as per current state)
    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Palette
    const charcoal = rgb(0x0b/255, 0x0d/255, 0x0f/255);
    const graphite = rgb(0x1a/255, 0x1f/255, 0x24/255);
    const neon     = rgb(0x16/255, 0xFF/255, 0x70/255);
    const white    = rgb(0xE6/255, 0xE7/255, 0xEB/255);

    // Background
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: charcoal });

    // Inner dashed frame (visual reference — unchanged)
    // (pdf-lib lacks native dashed stroke; keep solid thin frame to avoid layout drift)
    page.drawRectangle({
      x: 60, y: 60, width: pageWidth - 120, height: pageHeight - 120,
      borderColor: graphite, borderWidth: 1, opacity: 0.6,
    });

    // Header line / title (unchanged typography)
    page.drawText('Proof you can point to.', {
      x: pageWidth / 2,
      y: 630 - 370, // 260 baseline in SVG coords → 630-260=370 in PDF coords
      size: 64,
      font: helvBold,
      color: neon,
      xSkew: 0,
      ySkew: 0,
      rotate: 0,
    });

    // Center-align helper (drawText has no built-in center; measure + offset)
    // Adjust the title to be centered exactly
    const title = 'Proof you can point to.';
    const titleWidth = helvBold.widthOfTextAtSize(title, 64);
    page.drawText(title, {
      x: (pageWidth - titleWidth) / 2,
      y: 630 - 370,
      size: 64,
      font: helvBold,
      color: neon,
    });

    const subtitle = 'Because memory is fallible—timestamps aren’t.';
    const subSize = 40;
    const subWidth = helvBold.widthOfTextAtSize(subtitle, subSize);
    page.drawText(subtitle, {
      x: (pageWidth - subWidth) / 2,
      y: 630 - 335, // 335 from SVG → 630-335 = 295
      size: subSize,
      font: helvBold,
      color: white,
    });

    // -------- LOGO (transparent PNG enforced) -----------------------
    // Prefer logo_nobg.png; fallback to logo.png if missing.
    let logoBytes = null;
    const tryPaths = [
      path.join(__dirname, 'assets', 'logo_nobg.png'),
      path.join(__dirname, 'assets', 'logo.png'),
    ];
    for (const p of tryPaths) {
      try {
        if (fs.existsSync(p)) {
          logoBytes = fs.readFileSync(p);
          trace.logo_src = path.basename(p);
          break;
        }
      } catch (_) {/*noop*/}
    }

    if (logoBytes) {
      try {
        // MUST use embedPng to preserve alpha (no JPG fallback)
        const logoImg = await pdfDoc.embedPng(logoBytes);
        const logoW = 200; // keep compact; do not intrude on text
        const scale = logoW / logoImg.width;
        const logoH = logoImg.height * scale;

        // Place in the upper-left safe area inside the frame
        const margin = 60;
        const logoX = margin + 8;
        const logoY = pageHeight - margin - logoH - 8;

        page.drawImage(logoImg, {
          x: logoX,
          y: logoY,
          width: logoW,
          height: logoH,
        });

        trace.logo = 1;
      } catch (e) {
        trace.logo = -1; // embed failed
      }
    } else {
      trace.logo = 0;     // not found
    }

    // -------- Proof summary block (kept minimal; your live typography remains) -------
    const left = 100;
    let y = 250;
    const lineH = 26;

    const label = (t, yy) => page.drawText(t, { x: left, y: yy, size: 14, font: helv, color: white, opacity: 0.7 });
    const value = (t, yy) => page.drawText(t, { x: left + 180, y: yy, size: 16, font: helvBold, color: white });

    label('Display Name', y);   value(displayName, y);   y -= lineH;
    label('Document ID', y);    value(id, y);            y -= lineH;
    label('Quick ID', y);       value(quickId || '—', y);y -= lineH;
    label('Verify URL', y);     value(verifyUrl, y);     y -= lineH;

    // -------- QR CODE (transparent PNG; safe placement; explicit size) -----------
    // Make background fully transparent to avoid any box; margin=0 to keep it compact.
    const qrSize = 120;
    try {
      const dataUrl = await QRCode.toDataURL(verifyUrl, {
        errorCorrectionLevel: 'M',
        margin: 0,
        scale: 8,
        color: {
          dark: '#E6E7EB',     // light text color for coherence on dark bg
          light: '#00000000',  // fully transparent background
        },
      });
      const base64 = dataUrl.split(',')[1];
      const qrBytes = Buffer.from(base64, 'base64');
      const qrImg = await pdfDoc.embedPng(qrBytes);

      const margin = 60;
      const qrX = pageWidth - margin - qrSize;
      const qrY = margin; // bottom-right, clearly on page

      page.drawImage(qrImg, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });

      trace.qr = 1;
    } catch (e) {
      trace.qr = -1; // generation or embed failed
    }

    // -------- Footer: verification hint (unchanged tone) -----------
    const hint = 'Scan the QR or visit the Verify URL to view anchor status and confirmations.';
    page.drawText(hint, {
      x: 100,
      y: 100,
      size: 12,
      font: helv,
      color: white,
      opacity: 0.8,
    });

    // -------- Serialize + respond ----------------------------------
    const pdfBytes = await pdfDoc.save();

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        ...HEADERS_NO_CACHE,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
        'X-DocuProof-Version': trace.version,
        'X-DocuProof-QR': String(trace.qr),
        'X-DocuProof-Logo': String(trace.logo),
        'X-DocuProof-Logo-Src': trace.logo_src,
      },
      body: Buffer.from(pdfBytes).toString('base64'),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        ...HEADERS_NO_CACHE,
        'Content-Type': 'application/json',
        'X-DocuProof-Version': 'proof_pdf v4 (exception)',
      },
      body: JSON.stringify({ error: 'PDF generation failed', message: String(err && err.message || err) }),
    };
  }
};