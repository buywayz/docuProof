// netlify/functions/proof_pdf.js
// On-brand, fixed-layout PDF using pdf-lib. Dark page background, white content card,
// consistent spacing, and safe word-wrapping (no overlaps).

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const proofId     = (qs.id || '').trim();          // required
    const filename    = (qs.filename || '').trim();    // optional
    const displayName = (qs.displayName || '').trim(); // optional

    if (!proofId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: 'Missing required query parameter: id',
      };
    }

    // Deterministic 10-char quick verify id from proofId
    const digest = crypto.createHash('sha256').update(proofId).digest();
    const quickId = Buffer.from(digest).toString('base64url').slice(0, 10);

    // Page + palette
    const PAGE_W = 842;  // A4 landscape-ish width for more room (but we’ll keep portrait feel)
    const PAGE_H = 595;
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    const { width, height } = page.getSize();

    // Colors (brand)
    const green  = rgb(0x16/255, 0xff/255, 0x70/255);                // #16FF70
    const black  = rgb(0.04, 0.05, 0.06);                            // page bg
    const white  = rgb(1,1,1);
    const gray9  = rgb(0.09,0.10,0.12);
    const gray40 = rgb(0.40,0.43,0.47);
    const gray55 = rgb(0.55,0.58,0.62);
    const gray80 = rgb(0.80,0.82,0.86);

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // --- Background ---
    page.drawRectangle({ x: 0, y: 0, width, height, color: black });

    // --- Header bar ---
    const HEADER_H = 48;
    page.drawRectangle({ x: 0, y: height-HEADER_H, width, height: HEADER_H, color: gray9 });

    // Logo (optional) + title
    let titleX = 24;
    try {
      const logoPath = path.resolve(__dirname, '../../assets/favicons/favicon-192x192.png');
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        const logoImg = await pdfDoc.embedPng(logoBytes);
        const L = 28;
        page.drawImage(logoImg, { x: 20, y: height-HEADER_H + (HEADER_H-L)/2, width: L, height: L });
        titleX = 20 + L + 10;
      }
    } catch (_) {}

    page.drawText('docuProof.io — Proof you can point to.', {
      x: titleX, y: height - HEADER_H + 14, size: 16, font: fontBold, color: green
    });

    // --- Content Card ---
    const CARD_W = width - 96;
    const CARD_H = height - (HEADER_H + 64);
    const CARD_X = (width - CARD_W) / 2;
    const CARD_Y = 32;
    page.drawRectangle({
      x: CARD_X, y: CARD_Y, width: CARD_W, height: CARD_H,
      color: white, borderWidth: 0, opacity: 1
    });

    // Content padding
    const PAD = 32;
    const contentX = CARD_X + PAD;
    const contentW = CARD_W - PAD*2;
    let y = CARD_Y + CARD_H - PAD;

    // Helpers
    const draw = (text, size, color=gray40, font=fontRegular) => {
      page.drawText(String(text), { x: contentX, y, size, font, color, maxWidth: contentW });
    };
    const measure = (text, size, font=fontRegular) => font.heightAtSize(size);
    const wrapLines = (text, size, font=fontRegular, maxW=contentW) => {
      const words = String(text).split(/\s+/);
      const lines = [];
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (font.widthOfTextAtSize(t, size) <= maxW) line = t;
        else {
          if (line) lines.push(line);
          // handle ultra-long token
          if (font.widthOfTextAtSize(w, size) > maxW) {
            let chunk = '';
            for (const ch of w) {
              if (font.widthOfTextAtSize(chunk + ch, size) <= maxW) chunk += ch;
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
    const drawBlock = (label, value, opts={}) => {
      const labelSize = opts.labelSize || 10;
      const valueSize = opts.valueSize || 12;
      const gap       = opts.gap || 6;
      const vColor    = opts.vColor || gray40;
      const lColor    = opts.lColor || gray55;

      y -= labelSize + 2;
      page.drawText(String(label), { x: contentX, y, size: labelSize, font: fontRegular, color: lColor });

      const lines = wrapLines(value ?? '—', valueSize, fontRegular, contentW);
      y -= (gap + valueSize);
      for (let i=0;i<lines.length;i++) {
        page.drawText(lines[i], { x: contentX, y, size: valueSize, font: fontRegular, color: vColor, maxWidth: contentW });
        if (i < lines.length-1) y -= valueSize + 4;
      }
      y -= 10; // section spacing
    };

    // Title
    y -= 8;
    page.drawText('Proof you can point to.', { x: contentX, y, size: 26, font: fontBold, color: black });
    y -= 30;

    // Subtext
    const intro = 'This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.';
    for (const ln of wrapLines(intro, 12)) {
      page.drawText(ln, { x: contentX, y, size: 12, font: fontRegular, color: gray55 }); y -= 16;
    }
    y -= 8;

    // Green section head
    page.drawText('Proof Summary', { x: contentX, y, size: 13, font: fontBold, color: green }); y -= 18;

    const createdAt = new Date().toISOString();
    drawBlock('Proof ID', proofId);
    drawBlock('Quick Verify ID', quickId);
    drawBlock('Created (UTC)', createdAt);
    if (filename)    drawBlock('File Name', filename);
    if (displayName) drawBlock('Display Name', displayName);

    // Verification section
    page.drawText('Verification', { x: contentX, y, size: 13, font: fontBold, color: green }); y -= 18;
    const verifyUrl = `https://docuproof.io/.netlify/functions/verify_page?id=${encodeURIComponent(proofId)}`;
    drawBlock('Public Verify URL', verifyUrl);

    // Short callouts
    const callouts = [
      'Anyone can verify this proof at any time. Use the Verify URL or the Quick Verify ID above.',
      'docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.'
    ];
    for (const para of callouts) {
      for (const ln of wrapLines(para, 10)) {
        page.drawText(ln, { x: contentX, y, size: 10, font: fontRegular, color: gray55 }); y -= 14;
      }
      y -= 6;
    }

    // Footer
    const footer = '© 2025 docuProof.io — All rights reserved.';
    page.drawText(footer, { x: contentX, y, size: 10, font: fontRegular, color: gray80 });

    const bytes = await pdfDoc.save();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="docuProof_${quickId}.pdf"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      isBase64Encoded: true,
      body: Buffer.from(bytes).toString('base64'),
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