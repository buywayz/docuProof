// netlify/functions/proof_pdf.js
// STEP 1: Baseline layout (header, panel, title, subtitle) — no logo, no table, no QR

const PDFDocument = require('pdfkit');
const { Buffer } = require('buffer');

exports.handler = async (event) => {
  try {
    // -------- Inputs (we’ll use more of these in later steps) --------
    const q = new URLSearchParams(event.rawQuery || event.queryStringParameters || {});
    const proofId   = q.get('id')          || 'qr_fix01';
    const quickId   = q.get('quickId')     || '00000000';
    const created   = q.get('createdUtc')  || new Date().toISOString();
    const filename  = q.get('filename')    || 'Launch-Test.pdf';
    const display   = q.get('displayName') || 'Launch Sync Test';
    const verifyUrl = q.get('verifyUrl')   || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;

    // -------- Brand colors (stable across steps) --------
    const COL_BG     = '#0b0d0f';  // page background
    const COL_PANEL  = '#151a1f';  // card background
    const COL_TEXT   = '#e6e7eb';
    const COL_MUTED  = '#9aa2ab';
    const COL_ACCENT = '#16FF70';

    // -------- Page & typography --------
    const MARGIN     = 36;
    const PAGE_SIZE  = 'LETTER';
    const LAYOUT     = 'landscape';

    const TITLE_SIZE = 28;  // “Proof you can point to.”
    const SUB_SIZE   = 12;  // subtitle

    // -------- Create PDF --------
    const doc = new PDFDocument({
      size: PAGE_SIZE,
      layout: LAYOUT,
      margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      pdfVersion: '1.3', // conservative, Acrobat-safe
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise((r) => doc.on('end', () => r(Buffer.concat(chunks))));

    // Background
    const { width: PW, height: PH } = doc.page;
    doc.save().rect(0, 0, PW, PH).fill(COL_BG).restore();

    // Header (text only; no logo)
    const brandY = MARGIN + 6;
    doc.fillColor(COL_ACCENT)
       .font('Helvetica-Bold')
       .fontSize(20)
       .text('docuProof.io', MARGIN, brandY, { continued: true });

    doc.fillColor(COL_TEXT)
       .font('Helvetica')
       .text(' — Proof you can point to.');

    // Panel (card)
    const PANEL_R   = 14;
    const PANEL_PAD = 26;
    const panelX = MARGIN;
    const panelY = MARGIN + 36; // space under header line
    const panelW = PW - MARGIN * 2;
    const panelH = PH - panelY - MARGIN;

    doc.save()
       .roundedRect(panelX, panelY, panelW, panelH, PANEL_R)
       .fill(COL_PANEL)
       .restore();

    // Title + subtitle inside panel
    let x = panelX + PANEL_PAD;
    let y = panelY + PANEL_PAD;

    doc.fillColor(COL_TEXT)
       .font('Helvetica-Bold')
       .fontSize(TITLE_SIZE)
       .text('Proof you can point to.', x, y);

    y += 34;

    doc.fillColor(COL_MUTED)
       .font('Helvetica')
       .fontSize(SUB_SIZE)
       .text(
         'This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.',
         x,
         y,
         { width: panelW - 2 * PANEL_PAD }
       );

    // End + return
    doc.end();
    const pdf = await done;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache,no-store,must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
      body: pdf.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'PDF build failed', detail: String(err && err.message || err) }),
    };
  }
};