// netlify/functions/proof_pdf.js
// PDF “Proof Receipt” using pdf-lib with width-aware wrapping + logo + Quick Verify ID (stable).

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const longId     = (params.id || '').trim();     // e.g., cs_live_...
    const hash       = (params.hash || '').trim();
    const filename   = (params.filename || '').trim();
    const displayName = (params.displayName || '').trim();  // <-- NEW

    if (!longId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: 'Missing required query parameter: id',
      };
    }

    // ---- Quick Verify ID (10 chars, URL-safe, STABLE) ----
    // Deterministic: based solely on longId so it never changes.
    const digest = crypto.createHash('sha256').update(longId).digest();
    const quickId = Buffer.from(digest).toString('base64url').slice(0, 10);

    // ---- Page setup: roomy portrait page + generous margins ----
    const PAGE_W = 740;
    const PAGE_H = 980;
    const margin = 56;
    const headerH = 64;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const { width, height } = page.getSize();
    const contentX = margin;
    const contentW = width - margin * 2;

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Colors
    const brand = rgb(0x16 / 255, 0xff / 255, 0x70 / 255);
    const black = rgb(0, 0, 0);
    const grayDark = rgb(0.10, 0.10, 0.10);
    const gray = rgb(0.30, 0.30, 0.30);
    theLight = rgb(0.55, 0.55, 0.55);

    // Helpers
    let y = height - margin;
    const drawText = (text, x, y, size, font, color) =>
      page.drawText(String(text), { x, y, size, font, color, maxWidth: contentW });

    const wrapIntoLines = (text, font, size, maxWidth) => {
      const words = String(text).split(/\s+/);
      const lines = [];
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= maxWidth) {
          line = t;
        } else {
          if (line) lines.push(line);
          if (font.widthOfTextAtSize(w, size) > maxWidth) {
            let chunk = '';
            for (const ch of w) {
              if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) chunk += ch;
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
      y -= 18; drawText(label, contentX, y, labelSize, fontRegular, theLight);
      for (const ln of wrapIntoLines(value, fontRegular, valueSize, contentW)) {
        y -= 14; drawText(ln, contentX, y, valueSize, fontRegular, grayDark);
      }
    };

    // Header: prefer the site banner if available, else fallback to your current bar+logo
let usedBanner = false;
try {
  // banner lives at project root and will be bundled via netlify.toml included_files
  const bannerPath = path.resolve(process.cwd(), 'docuproof-banner.png');
  if (fs.existsSync(bannerPath)) {
    const bannerBytes = fs.readFileSync(bannerPath);
    const bannerImg = await pdfDoc.embedPng(bannerBytes);
    // Fit nicely across the page content width
    const targetW = contentW;
    const imgW = bannerImg.width, imgH = bannerImg.height;
    const scale = targetW / imgW;
    const drawW = targetW;
    const drawH = imgH * scale;
    // draw at top margin
    page.drawImage(bannerImg, { x: contentX, y: height - margin - drawH, width: drawW, height: drawH });
    // advance y below banner
    y = height - margin - drawH - 18;
    usedBanner = true;
  }
} catch { /* ignore banner issues */ }

if (!usedBanner) {
  // Fallback to your existing header style
  page.drawRectangle({ x: 0, y: height - headerH, width: width, height: headerH, color: black });
  let logoBytes = null;
  try {
    const logoPath = path.resolve(__dirname, '../../assets/favicons/favicon-192x192.png');
    logoBytes = fs.readFileSync(logoPath);
  } catch (_) {}
  if (logoBytes) {
    const logoImg = await pdfDoc.embedPng(logoBytes);
    const L = 28;
    page.drawImage(logoImg, { x: contentX, y: height - headerH + (headerH - L) / 2, width: L, height: L });
    drawText('docuProof.io — Trustless Proof. Zero Exposure.',
      contentX + L + 10, height - headerH + (headerH - 14) / 2 + 2, 14, fontBold, brand);
  } else {
    drawText('docuProof.io — Trustless Proof. Zero Exposure.',
      contentX, height - headerH + (headerH - 14) / 2 + 2, 14, fontBold, brand);
  }
  // position content below fallback header
  y -= (headerH + 30);
} else {
  // when banner used, we've already lowered y
  y -= 12;
}

    // Title
    y -= (headerH + 30);
    drawText('Blockchain-Anchored Proof Receipt', contentX, y, 22, fontBold, grayDark);

    // Intro
    y -= 28;
    for (const ln of wrapIntoLines(
      'This document certifies that a proof-of-existence record was created for the item described below.',
      fontRegular, 12, contentW)) {
      drawText(ln, contentX, y, 12, fontRegular, gray);
      y -= 14;
    }

    // Fields
    const createdAt = new Date().toISOString();
    drawWrappedBlock('Proof ID (Transaction)', longId);
    drawWrappedBlock('Quick Verify ID', quickId);
    drawWrappedBlock('Created (UTC)', createdAt);
    if (filename) drawWrappedBlock('File Name', filename);
    if (displayName) drawWrappedBlock('Display Name', displayName);
    if (hash)     drawWrappedBlock('SHA-256 Hash', hash);

    const verifyUrl = `https://docuproof.io/.netlify/functions/verify_page?id=${encodeURIComponent(longId)}`;
    y -= 6; drawWrappedBlock('Public Verification URL', verifyUrl);

    y -= 10;
    for (const ln of wrapIntoLines(
      'Quick verify: visit docuproof.io/verify and paste the Quick Verify ID shown above.',
      fontRegular, 10, contentW)) {
      drawText(ln, contentX, y, 10, fontRegular, theLight);
      y -= 12;
    }

    y -= 10;
    for (const ln of wrapIntoLines(
      'docuProof provides cryptographic proof-of-existence by hashing and timestamping. docuProof is not a notary and does not provide notarial services or legal attestation.',
      fontRegular, 10, contentW)) {
      drawText(ln, contentX, y, 10, fontRegular, theLight);
      y -= 12;
    }

    y -= 12;
    drawText('© 2025 docuProof.io — All rights reserved.', contentX, y, 10, fontRegular, theLight);

    const pdfBytes = await pdfDoc.save();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="docuProof_${quickId}.pdf"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      isBase64Encoded: true,
      body: Buffer.from(pdfBytes).toString('base64'),
    };
  } catch (err) {
    console.error('[proof_pdf] fatal error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
      body: 'Internal Server Error',
    };
  }
};