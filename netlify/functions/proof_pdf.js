// netlify/functions/proof_pdf.js
// Pure pdfkit pipeline + qrcode PNG -> single, robust implementation.

const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const PDFDocument = require('pdfkit');

// ---------- helpers ----------
function toBuffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (c) => chunks.push(c));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

function pickLogoPath() {
  // Prefer transparent logo; fall back to opaque.
  const tries = [
    path.join(__dirname, 'assets', 'logo_nobg.png'),
    path.join(__dirname, 'assets', 'logo.png'),
  ];
  for (const p of tries) {
    try {
      fs.accessSync(p, fs.constants.R_OK);
      return { found: p, tried: tries };
    } catch (_) {/* keep trying */}
  }
  return { found: null, tried: tries };
}

function param(query, key, fallback = '') {
  const v = (query && (query[key] ?? query[key?.toLowerCase?.()])) ?? '';
  return String(v || fallback);
}

function header(name, val, h) { h[name] = val; }

// ---------- handler ----------
exports.handler = async (event) => {
  const q = event.queryStringParameters || {};

  // Inputs
  const proofId     = param(q, 'id', 'missing');
  const fileName    = param(q, 'filename', 'Document.pdf');
  const displayName = param(q, 'displayName', '');
  const verifyUrl   = param(q, 'verifyUrl', '');
  const quickId     = param(q, 'quickId', '');

  // Asset discovery
  const { found: logoPath, tried: logoTried } = pickLogoPath();

  // Generate QR (PNG buffer). If verifyUrl is missing, derive from proofId.
  const qrPayload = verifyUrl || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;
  const qrPngBuffer = await QRCode.toBuffer(qrPayload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    scale: 8,  // good quality at 256px+
    color: { dark: '#000000', light: '#FFFFFF00' } // transparent light
  });

  // Compose PDF with pdfkit
  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 56, left: 56, right: 56, bottom: 56 } // 0.78”
  });

  // Pipe to buffer
  const pass = new stream.PassThrough();
  doc.pipe(pass);

  // Colors / fonts
  const fg = '#E6E7EB';
  const dim = '#93A1A1';
  const accent = '#16FF70';
  const panel = '#111418';

  // Title bar
  doc.rect(36, 36, 540, 36).fill(panel);

  // Logo (if available)
  let usedLogo = '0';
  let usedLogoPath = '';
  try {
    if (logoPath) {
      const imgX = 44;
      const imgY = 40;
      const imgH = 24; // small, crisp
      doc.image(logoPath, imgX, imgY, { height: imgH });
      usedLogo = '1';
      usedLogoPath = logoPath;
    }
  } catch (_) { /* ignore; we’ll report in headers */ }

  // Title
  doc.fillColor(accent).fontSize(22).text('Proof you can point to.', 36 + 160, 42, {
    width: 400, align: 'left'
  });

  // Panel for body
  doc.moveDown();
  const panelTop = 100;
  doc.save().roundedRect(36, panelTop, 540, 640, 8).lineWidth(1).strokeColor('#1a1f24').stroke().restore();

  // Heading
  doc.fillColor(fg).fontSize(18).text('Proof Summary', 56, panelTop + 18);

  // Body text helper
  function field(label, value) {
    const xLabel = 56, xValue = 170;
    doc.fillColor(accent).fontSize(11).text(label, xLabel, doc.y + 10);
    doc.fillColor(fg).fontSize(11).text(value, xValue, doc.y - 14);
  }

  doc.moveDown().fontSize(11).fillColor(dim)
    .text('This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.',
          56, panelTop + 42, { width: 500 });

  doc.moveDown(0.5);

  // Fields
  field('Proof ID',           proofId);
  field('Quick Verify ID',    quickId || '(not set)');
  field('Created (UTC)',      new Date().toISOString());
  field('File Name',          fileName);
  field('Display Name',       displayName || '(not set)');
  field('Public Verify URL',  qrPayload);

  // QR block (right side box)
  const qrBox = { x: 420, y: panelTop + 20, size: 140 };
  doc.save()
     .roundedRect(qrBox.x - 6, qrBox.y - 6, qrBox.size + 12, qrBox.size + 12, 6)
     .lineWidth(1).strokeColor('#1a1f24').stroke().restore();

  // Draw QR image
  try {
    doc.image(qrPngBuffer, qrBox.x, qrBox.y, { width: qrBox.size, height: qrBox.size });
  } catch (_) { /* if this fails we still ship the PDF */ }

  // Footer
  doc.fillColor(dim).fontSize(9)
     .text('docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.',
           56, 720, { width: 500 });
  doc.fillColor(dim).text(`© ${new Date().getUTCFullYear()} docuProof.io — All rights reserved.`, 56, 735);

  doc.end();
  const pdfBuffer = await toBuffer(pass);

  // Headers (diagnostic)
  const headers = {
    'Content-Type'              : 'application/pdf',
    'Content-Disposition'       : `inline; filename="${fileName.replace(/"/g, '')}"`,
    'Cache-Control'             : 'no-cache,no-store,must-revalidate',
    'Pragma'                    : 'no-cache',
    'Expires'                   : '0',
    'Strict-Transport-Security' : 'max-age=31536000',
  };
  header('x-docuproof-version', 'proof_pdf v5.0.0 (pdfkit-only)', headers);
  header('x-docuproof-logo', usedLogo, headers);
  header('x-docuproof-logo-src', path.basename(usedLogoPath || '') || 'none', headers);
  header('x-docuproof-logo-path', usedLogoPath || 'none', headers);
  header('x-docuproof-logo-tried', logoTried.join(' | '), headers);
  header('x-docuproof-qr', '1', headers);

  return {
    statusCode: 200,
    headers,
    isBase64Encoded: true,
    body: pdfBuffer.toString('base64'),
  };
};