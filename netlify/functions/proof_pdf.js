// netlify/functions/proof_pdf.js
// v5.1.0 — pdfkit-only, vector QR (no PNG decode), no header bar.

const QR = require('qrcode');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const PDFDocument = require('pdfkit');

// --- utils ---
const toBuffer = (readable) => new Promise((res, rej) => {
  const chunks = []; readable.on('data', c => chunks.push(c));
  readable.on('end', () => res(Buffer.concat(chunks)));
  readable.on('error', rej);
});
const param = (q, k, d='') => String((q && (q[k] ?? q[k?.toLowerCase?.()])) || d);
const header = (k, v, h) => { h[k] = v; };

function pickLogoPath() {
  const tries = [
    path.join(__dirname, 'assets', 'logo_nobg.png'),
    path.join(__dirname, 'assets', 'logo.png'),
  ];
  for (const p of tries) {
    try { fs.accessSync(p, fs.constants.R_OK); return { found: p, tried: tries }; }
    catch (_) {}
  }
  return { found: null, tried: tries };
}

// Draw QR modules as vector squares so we never depend on image decoders.
async function drawVectorQR(doc, text, x, y, sizePx, opts={}) {
  const qr = QR.create(text, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const count = modules.size;
  const scale = sizePx / count;
  const light = opts.light || '#FFFFFF';
  const dark  = opts.dark  || '#000000';

  // background behind QR for contrast
  doc.save().rect(x, y, sizePx, sizePx).fill(light).restore();

  doc.save().fillColor(dark);
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (modules.get(r, c)) {
        const rx = x + c * scale;
        const ry = y + r * scale;
        doc.rect(rx, ry, Math.ceil(scale), Math.ceil(scale)).fill();
      }
    }
  }
  doc.restore();
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const proofId     = param(q, 'id', 'missing');
  const fileName    = param(q, 'filename', 'Document.pdf').replace(/"/g, '');
  const displayName = param(q, 'displayName', '');
  const verifyUrl   = param(q, 'verifyUrl', '');
  const quickId     = param(q, 'quickId', '');

  const { found: logoPath, tried: logoTried } = pickLogoPath();

  // Build PDF
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 56, left: 56, right: 56, bottom: 56 } });
  const pass = new stream.PassThrough(); doc.pipe(pass);

  // Palette
  const fg = '#E6E7EB';
  const dim = '#8C9AA5';
  const accent = '#16FF70';
  const outline = '#1a1f24';

  // Title (no header bar)
  if (logoPath) {
    try { doc.image(logoPath, 56, 40, { height: 28 }); } catch(_) {}
  }
  doc.fillColor(accent).fontSize(22).text('Proof you can point to.', 100, 42, { width: 450, align: 'left' });

  // Panel
  const panelTop = 100;
  doc.save().roundedRect(36, panelTop, 540, 640, 8).lineWidth(1).strokeColor(outline).stroke().restore();

  // Subtitle
  doc.fillColor(fg).fontSize(11)
    .text('This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.',
          56, panelTop + 16, { width: 500 });

  // Heading
  doc.fillColor(accent).fontSize(18).text('Proof Summary', 56, panelTop + 46);

  // Right-side QR (vector)
  const qrPayload = verifyUrl || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;
  const qr = { x: 420, y: panelTop + 20, size: 148 };
  await drawVectorQR(doc, qrPayload, qr.x, qr.y, qr.size, { light: '#FFFFFF', dark: '#0B0D0F' });
  // Thin border around QR block
  doc.save().roundedRect(qr.x - 6, qr.y - 6, qr.size + 12, qr.size + 12, 6).lineWidth(1).strokeColor(outline).stroke().restore();

  // Field helper
  function field(label, value) {
    const xLabel = 56, xValue = 170;
    doc.fillColor(accent).fontSize(11).text(label, xLabel, doc.y + 10);
    doc.fillColor(fg).fontSize(11).text(value, xValue, doc.y - 14);
  }

  // Fields
  field('Proof ID',           proofId);
  field('Quick Verify ID',    quickId || '(not set)');
  field('Created (UTC)',      new Date().toISOString());
  field('File Name',          fileName);
  field('Display Name',       displayName || '(not set)');
  field('Public Verify URL',  qrPayload);

  // Footer
  doc.moveDown(1.2);
  doc.fillColor(dim).fontSize(9)
    .text('docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.',
          56, 720, { width: 500 });
  doc.fillColor(dim).text(`© ${new Date().getUTCFullYear()} docuProof.io — All rights reserved.`, 56, 735);

  doc.end();
  const pdfBuffer = await toBuffer(pass);

  const headers = {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="${fileName}"`,
    'Cache-Control': 'no-cache,no-store,must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Strict-Transport-Security': 'max-age=31536000',
  };
  headers['x-docuproof-version']    = 'proof_pdf v5.1.0 (pdfkit+vector-qr)';
  headers['x-docuproof-logo']       = logoPath ? '1' : '0';
  headers['x-docuproof-logo-src']   = logoPath ? path.basename(logoPath) : 'none';
  headers['x-docuproof-logo-path']  = logoPath || 'none';
  headers['x-docuproof-logo-tried'] = logoTried.join(' | ');
  headers['x-docuproof-qr']         = '1';

  return {
    statusCode: 200,
    headers,
    isBase64Encoded: true,
    body: pdfBuffer.toString('base64'),
  };
};