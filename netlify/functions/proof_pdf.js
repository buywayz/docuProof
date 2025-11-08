// netlify/functions/proof_pdf.js
// On-brand “Proof you can point to.” certificate (pdf-lib)

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const proofId     = (q.id || '').trim();
    const filename    = (q.filename || '').trim();
    const displayName = (q.displayName || '').trim();
    const createdUTC  = new Date().toISOString();

    if (!proofId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
        body: 'Missing required query parameter: id'
      };
    }

    // Stable 10-char quick verify id from proofId
    const quickId = Buffer
      .from(crypto.createHash('sha256').update(proofId).digest())
      .toString('base64url')
      .slice(0, 10);

    // Page + palette
    const W = 792;  // 11in @72dpi landscape-ish width (but still portrait proportions)
    const H = 612;
    const PAD = 36;
    const CARD_W = W - PAD * 2;
    const CARD_H = H - PAD * 2;

    const bgDark     = rgb(0.06, 0.07, 0.08);
    const cardWhite  = rgb(1, 1, 1);
    const ink        = rgb(0.13, 0.14, 0.16);
    const inkLight   = rgb(0.55, 0.60, 0.67);
    const accent     = rgb(0x16/255, 0xFF/255, 0x70/255); // #16FF70

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([W, H]);

    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Background + card
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bgDark });
    page.drawRectangle({
      x: PAD, y: PAD, width: CARD_W, height: CARD_H,
      color: cardWhite, borderColor: rgb(0.90, 0.92, 0.95), borderWidth: 0.5
    });

    // Header bar inside card
    const headerH = 64;
    page.drawRectangle({
      x: PAD, y: H - PAD - headerH, width: CARD_W, height: headerH,
      color: bgDark
    });

    // Logo (optional) + title
    let titleX = PAD + 20;
    try {
      const logoPath = path.resolve(__dirname, '../../assets/favicons/favicon-192x192.png');
      if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        const logo = await pdf.embedPng(logoBytes);
        const L = 28;
        page.drawImage(logo, { x: PAD + 20, y: H - PAD - headerH/2 - L/2, width: L, height: L });
        titleX += L + 12;
      }
    } catch (_) {}

    page.drawText('docuProof.io — Proof you can point to.', {
      x: titleX, y: H - PAD - headerH/2 - 6, size: 18, font: helvB, color: accent
    });

    // Typesetting helpers confined to the card
    const left   = PAD + 24;
    const right  = PAD + CARD_W - 24;
    const width  = right - left;
    let cursorY  = H - PAD - headerH - 28;

    function draw(text, size=12, font=helv, color=ink) {
      page.drawText(String(text), { x: left, y: cursorY, size, font, color, maxWidth: width, lineHeight: size*1.25 });
      cursorY -= size * 1.6;
    }

    function drawH1(text) {
      page.drawText(String(text), { x: left, y: cursorY, size: 28, font: helvB, color: ink });
      cursorY -= 34;
    }

    function drawKicker(text) {
      page.drawText(String(text), { x: left, y: cursorY, size: 12, font: helv, color: inkLight, maxWidth: width });
      cursorY -= 22;
    }

    function field(label, value, hint='') {
      // Label in faint green, value in dark ink, hint line below (light gray)
      page.drawText(String(label), { x: left, y: cursorY, size: 11, font: helvB, color: accent });
      cursorY -= 15;
      page.drawText(String(value || '—'), { x: left, y: cursorY, size: 13, font: helv, color: ink, maxWidth: width });
      cursorY -= 18;
      if (hint) {
        page.drawText(String(hint), { x: left, y: cursorY, size: 10.5, font: helv, color: inkLight, maxWidth: width });
        cursorY -= 16;
      }
      cursorY -= 4;
    }

    // Title + short explainer
    drawH1('Proof you can point to.');
    drawKicker(
      'This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.'
    );

    // Fields with micro-copy
    draw('Proof Summary', 14, helvB, accent);

    field('Proof ID',
      proofId,
      'Your permanent reference for this proof. Keep it with your records.'
    );

    field('Quick Verify ID',
      quickId,
      '10-character code you can paste at docuProof.io/verify for fast lookups.'
    );

    field('Created (UTC)', createdUTC);

    if (filename) {
      field('File Name', filename);
    }
    if (displayName) {
      field('Display Name', displayName);
    }

    // Verify URL (use the friendly redirect)
    const verifyUrl = `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;
    draw('Verification', 12, helvB, accent);
    field('Public Verify URL', verifyUrl, 'Anyone can verify anytime using this URL or the Quick Verify ID above.');

    // Footer disclaimer
    cursorY = Math.max(cursorY, PAD + 24);
    page.drawText(
      'docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.',
      { x: left, y: PAD + 32, size: 10.5, font: helv, color: inkLight, maxWidth: width }
    );
    page.drawText('© 2025 docuProof.io — All rights reserved.', {
      x: left, y: PAD + 16, size: 10.5, font: helv, color: inkLight
    });

    const bytes = await pdf.save();
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="docuProof_${quickId}.pdf"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store'
      },
      isBase64Encoded: true,
      body: Buffer.from(bytes).toString('base64')
    };
  } catch (err) {
    console.error('[proof_pdf] error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' },
      body: 'Internal Server Error'
    };
  }
};