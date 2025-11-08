// netlify/functions/proof_pdf.js
// Branded dark-mode PDF certificate: full black/dark background, on-brand green,
// clear micro-explanations. No white card. Works with StandardFonts only.

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const proofId    = (qs.id || 'YOUR_ID').trim();
    const filename   = (qs.filename || '').trim();
    const display    = (qs.displayName || '').trim();

    if (!proofId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: 'Missing ?id'
      };
    }

    // Stable 10-char “Quick Verify ID” from proofId
    const digest  = crypto.createHash('sha256').update(proofId).digest();
    const quickId = Buffer.from(digest).toString('base64url').slice(0, 10);

    // Colors (brand)
    const bg        = rgb(0.06, 0.07, 0.08);   // page background
    const headerBg  = rgb(0.09, 0.10, 0.12);   // top bar
    const brand     = rgb(0x16/255, 0xff/255, 0x70/255); // #16FF70
    const textHi    = rgb(0.92, 0.94, 0.96);   // high-contrast copy
    const textMed   = rgb(0.78, 0.80, 0.84);   // body copy
    const textDim   = rgb(0.60, 0.64, 0.70);   // captions

    // Page
    const W = 1056;  // ~11" @ 96 dpi feel
    const H = 744;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([W, H]);

    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Helpers
    const t = (s) => String(s ?? '');
    const text = (s, x, y, size, font, color) =>
      page.drawText(t(s), { x, y, size, font, color });

    // Simple word wrap
    const wrap = (s, font, size, max) => {
      const out = [];
      let line = '';
      for (const w of t(s).split(/\s+/)) {
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) <= max) line = next;
        else { if (line) out.push(line); line = w; }
      }
      if (line) out.push(line);
      return out;
    };

    // === Backgrounds ===
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bg });       // full dark
    const headerH = 56;
    page.drawRectangle({ x: 0, y: H - headerH, width: W, height: headerH, color: headerBg });

    // === Logo + Brand title in header ===
    let x = 28;
    const logoPath = path.resolve(process.cwd(), 'docuproof-banner.png'); // already included via netlify.toml
    try {
      if (fs.existsSync(logoPath)) {
        const imgBytes = fs.readFileSync(logoPath);
        const img = await pdf.embedPng(imgBytes);
        const h = headerH - 20, scale = h / img.height;
        const w = img.width * scale;
        page.drawImage(img, { x, y: H - headerH + (headerH - h)/2, width: w, height: h });
        x += w + 10;
      }
    } catch (_) { /* non-fatal */ }

    text('docuProof.io — Proof you can point to.', x, H - headerH + 18, 16, helvB, brand);

    // === Content ===
    const L = 56;              // left margin
    const R = W - 56;          // right margin
    const CW = R - L;          // content width
    let y = H - headerH - 48;  // start below header

    // Title
    text('Proof you can point to.', L, y, 32, helvB, textHi); y -= 40;

    // Intro
    for (const ln of wrap(
      'This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.',
      helv, 14, CW)) { text(ln, L, y, 14, helv, textMed); y -= 18; }
    y -= 10;

    // Section label
    text('Proof Summary', L, y, 16, helvB, brand); y -= 18;

    const field = (label, value, hint) => {
      text(label, L, y, 11, helvB, textHi); y -= 16;
      const lines = wrap(value, helv, 12, CW);
      for (const ln of lines) { text(ln, L, y, 12, helv, textHi); y -= 16; }
      if (hint) { for (const ln of wrap(hint, helv, 10, CW)) { text(ln, L, y, 10, helv, textDim); y -= 13; } }
      y -= 6;
    };

    const createdISO = new Date().toISOString();
    const verifyURL  = `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;

    field('Proof ID', proofId, 'Your permanent reference for this proof. Keep it with your records.');
    field('Quick Verify ID', quickId, '10-character code you can paste at docuProof.io/verify for fast lookups.');
    field('Created (UTC)', createdISO);
    if (filename) field('File Name', filename);
    if (display)  field('Display Name', display);

    // Verification block
    text('Verification', L, y, 13, helvB, brand); y -= 16;
    field('Public Verify URL', verifyURL, 'Anyone can verify this proof at any time using this URL or the Quick Verify ID above.');

    // Footer note
    y = Math.max(y, 90);
    for (const ln of wrap(
      'docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.',
      helv, 10, CW)) { text(ln, L, y, 10, helv, textDim); y -= 13; }
    text('© 2025 docuProof.io — All rights reserved.', L, y - 6, 10, helv, textDim);

    const bytes = await pdf.save();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="docuProof_${quickId}.pdf"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      },
      isBase64Encoded: true,
      body: Buffer.from(bytes).toString('base64')
    };
  } catch (e) {
    console.error('[proof_pdf] error', e);
    return { statusCode: 500, headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }, body: 'Internal Server Error' };
  }
};