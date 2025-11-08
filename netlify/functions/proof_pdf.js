// netlify/functions/proof_pdf.js
// Branded PDF “Proof you can point to.” certificate
// - Clean modern layout with subtle #16FF70 accents
// - Logo in header (assets/favicons/favicon-192x192.png) or banner fallback (docuproof-banner.png)
// - Concise, bold green section headers; Helvetica / Helvetica-Bold
// - Deterministic Quick Verify ID derived from the long proof id

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const longId      = String(qs.id || '').trim();        // e.g., cs_live_...
    const hash        = String(qs.hash || '').trim();      // optional
    const filename    = String(qs.filename || '').trim();  // optional
    const displayName = String(qs.displayName || '').trim(); // optional

    if (!longId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: 'Missing required query parameter: id',
      };
    }

    // === Stable Quick Verify ID (10 chars, URL-safe) ===
    const digest  = crypto.createHash('sha256').update(longId).digest();
    const quickId = Buffer.from(digest).toString('base64url').slice(0, 10);

    // Base site origin for verify URL
    const base =
      process.env.URL ||
      process.env.DEPLOY_URL ||
      (event.headers && event.headers.host && `https://${event.headers.host}`) ||
      'https://docuproof.io';

    const verifyUrl = `${base}/.netlify/functions/verify_page?id=${encodeURIComponent(longId)}`;

    // === Page & typography ===
    const PAGE_W = 740;
    const PAGE_H = 980;
    const margin = 56;
    const headerH = 72; // taller header for logo
    const contentW = PAGE_W - margin * 2;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Palette
    const brand     = rgb(0x16/255, 0xff/255, 0x70/255); // #16FF70
    const black     = rgb(0, 0, 0);
    const grayDark  = rgb(0.10, 0.10, 0.10);
    const grayBody  = rgb(0.30, 0.30, 0.30);
    const grayLight = rgb(0.55, 0.55, 0.55);

    // Helpers
    let y = height - margin;
    const drawText = (text, x, y, size, font, color, opts={}) =>
      page.drawText(String(text), { x, y, size, font, color, maxWidth: contentW, ...opts });

    const measure = (font, size, text) => font.widthOfTextAtSize(String(text), size);

    const wrapIntoLines = (text, font, size, maxWidth) => {
      const words = String(text).split(/\s+/);
      const lines = [];
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (measure(font, size, t) <= maxWidth) {
          line = t;
        } else {
          if (line) lines.push(line);
          if (measure(font, size, w) > maxWidth) {
            // Hyphenate long tokens
            let chunk = '';
            for (const ch of w) {
              if (measure(font, size, chunk + ch) <= maxWidth) chunk += ch;
              else { lines.push(chunk); chunk = ch; }
            }
            line = chunk;
          } else {
            line = w;
          }
        }
      }
      if (line) lines.push(line);
      return lines;
    };

    const drawWrappedBlock = (label, value, labelSize = 10, valueSize = 12) => {
      y -= 18; drawText(label, margin, y, labelSize, fontBold, brand);
      const val = value ? String(value) : '—';
      const lines = wrapIntoLines(val, fontRegular, valueSize, contentW);
      for (const ln of lines) {
        y -= 14; drawText(ln, margin, y, valueSize, fontRegular, grayDark);
      }
      y -= 4;
    };

    // === Header with logo (or banner) ===
    const contentX = margin;
    let usedBanner = false;

    // Try wide banner first (optional), then logo bar
    try {
      const bannerPath = path.resolve(process.cwd(), 'docuproof-banner.png');
      if (fs.existsSync(bannerPath)) {
        const bannerBytes = fs.readFileSync(bannerPath);
        const bannerImg = await pdfDoc.embedPng(bannerBytes);
        const scale = contentW / bannerImg.width;
        const drawW = contentW;
        const drawH = bannerImg.height * scale;
        page.drawImage(bannerImg, {
          x: contentX, y: height - margin - drawH, width: drawW, height: drawH,
        });
        y = height - margin - drawH - 18;
        usedBanner = true;
      }
    } catch (_) { /* ignore */ }

    if (!usedBanner) {
      // Black bar header + logo + tagline
      page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: black });

      let logoDrawn = false;
      try {
        const logoPath = path.resolve(__dirname, '../../assets/favicons/favicon-192x192.png');
        if (fs.existsSync(logoPath)) {
          const logoBytes = fs.readFileSync(logoPath);
          const logoImg = await pdfDoc.embedPng(logoBytes);
          const L = 36; // logo size
          const ly = height - headerH + (headerH - L) / 2;
          page.drawImage(logoImg, { x: contentX, y: ly, width: L, height: L });
          drawText('docuProof.io — Proof you can point to.', contentX + L + 12, ly + 10, 14, fontBold, brand);
          logoDrawn = true;
        }
      } catch (_) { /* ignore */ }

      if (!logoDrawn) {
        // Fallback: text-only header
        drawText('docuProof.io — Proof you can point to.', contentX, height - headerH + (headerH - 14) / 2 + 6, 14, fontBold, brand);
      }

      y = height - headerH - margin - 6;
    }

    // === Title ===
    y -= 18;
    drawText('Proof you can point to.', contentX, y, 24, fontBold, grayDark);
    y -= 8;

    // === Intro (short + confident) ===
    y -= 18;
    for (const ln of wrapIntoLines(
      'This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.',
      fontRegular, 12, contentW
    )) {
      drawText(ln, contentX, y, 12, fontRegular, grayBody);
      y -= 14;
    }

    // === Proof summary ===
    y -= 8;
    drawText('Proof Summary', contentX, y, 12, fontBold, brand);
    const createdAt = new Date().toISOString();
    drawWrappedBlock('Proof ID', longId);
    drawWrappedBlock('Quick Verify ID', quickId);
    drawWrappedBlock('Created (UTC)', createdAt);
    if (filename)    drawWrappedBlock('File Name', filename);
    if (displayName) drawWrappedBlock('Display Name', displayName);
    if (hash)        drawWrappedBlock('SHA-256 Hash', hash);

    // === Verification ===
    y -= 6;
    drawText('Verification', contentX, y, 12, fontBold, brand);
    drawWrappedBlock('Public Verify URL', verifyUrl);
    y -= 6;
    for (const ln of wrapIntoLines(
      'Anyone can verify this proof at any time. Use the Verify URL or the Quick Verify ID above.',
      fontRegular, 10, contentW
    )) {
      drawText(ln, contentX, y, 10, fontRegular, grayBody);
      y -= 12;
    }

    // === Fine print ===
    y -= 10;
    drawText('About docuProof', contentX, y, 12, fontBold, brand);
    for (const ln of wrapIntoLines(
      'docuProof anchors proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.',
      fontRegular, 10, contentW
    )) {
      drawText(ln, contentX, y, 10, fontRegular, grayLight);
      y -= 12;
    }

    // Footer
    y -= 10;
    drawText('© 2025 docuProof.io — All rights reserved.', contentX, y, 10, fontRegular, grayLight);

    const pdfBytes = await pdfDoc.save();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename || 'DocuProof-Certificate'}.pdf"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      isBase64Encoded: true,
      body: Buffer.from(pdfBytes).toString('base64'),
    };
  } catch (err) {
    console.error('[proof_pdf] error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
      body: 'Internal Server Error',
    };
  }
};