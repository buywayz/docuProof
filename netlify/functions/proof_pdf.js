// netlify/functions/proof_pdf.js
// PDF proof renderer — compact, readable, Acrobat-safe
// Header: brand line on left (“docuProof.io — Proof you can point to.”) + BIG logo on right (like Screenshot #2)
// Panel: title “Proof you can point to.” (not the tagline) + helper text + summary table
// QR: vector modules; small green pad + border; Acrobat-safe (no raster)

const PDFDocument = require('pdfkit');
const { Buffer } = require('buffer');
const fs = require('fs');
const path = require('path');
const QR = require('qrcode-generator'); // pure JS (no native deps)

exports.handler = async (event) => {
  try {
    // -------- Parse inputs --------
    const q = new URLSearchParams(event.rawQuery || event.queryStringParameters || {});
    const proofId   = q.get('id')          || 'qr_fix01';
    const quickId   = q.get('quickId')     || '00000000';
    const created   = q.get('createdUtc')  || new Date().toISOString();
    const filename  = q.get('filename')    || 'Launch-Test.pdf';
    const display   = q.get('displayName') || 'Launch Sync Test';
    const verifyUrl = q.get('verifyUrl')   || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;

    // -------- Colors & constants --------
    const COL_BG     = '#0b0d0f';
    const COL_PANEL  = '#151a1f';
    const COL_RULE   = '#2a3138';
    const COL_TEXT   = '#e6e7eb';
    const COL_MUTED  = '#9aa2ab';
    const COL_ACCENT = '#16FF70';
    const COL_QR_PAD = '#82ffa6';
    const COL_QR_FG  = '#000000';

    const PAGE_SIZE = 'LETTER';
    const LAYOUT    = 'landscape';
    const MARGIN    = 36;

    // Typography
    const TITLE_SIZE     = 28;  // Panel title (“Proof you can point to.”)
    const H2_SIZE        = 18;  // “Proof Summary”
    const LABEL_SIZE     = 11.5;
    const VALUE_SIZE     = 14;
    const HELP_SIZE      = 9.5;
    const LINE_GAP       = 6;
    const COL_GAP        = 28;
    const ROW_RULE_SPACE = 10;
    const LABEL_WIDTH    = 130;
    const VALUE_WIDTH    = 520;

    // QR sizing
    const QR_SIZE   = 240;
    const QR_PAD    = 18;
    const QR_BORDER = 18;
    const QR_BLOCK_W = QR_BORDER + QR_PAD + QR_SIZE + QR_PAD + QR_BORDER;

    // Logos
    const SMALL_LOGO = 18;   // tiny left icon in brand line
    const BIG_LOGO   = 96;   // large right logo (Screenshot #2)
    const LOGO_PATHS = [
      path.join(__dirname, 'assets', 'logo_nobg.png'),
      path.join(__dirname, 'assets', 'logo.png'),
    ];
    const logoPath = LOGO_PATHS.find(p => fs.existsSync(p));

    // -------- PDF doc --------
    const doc = new PDFDocument({
      size: PAGE_SIZE,
      layout: LAYOUT,
      margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      pdfVersion: '1.3',
    });

    // Helvetica AFM (bundled)
    doc.registerFont('Body', 'Helvetica');
    doc.registerFont('Body-Bold', 'Helvetica-Bold');
    doc.registerFont('Body-Oblique', 'Helvetica-Oblique');

    // Buffer the output
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    const pdfDone = new Promise(res => doc.on('end', () => res(Buffer.concat(chunks))));

    const { width: PW, height: PH } = doc.page;

    // Page bg
    doc.save().rect(0, 0, PW, PH).fill(COL_BG).restore();

    // ===== HEADER (match Screenshot #2) =====
    const headerY = MARGIN;                // top baseline
    const brandY  = headerY;               // text baseline
    let hx = MARGIN;

    // tiny left mark + brand text with single tagline
    if (logoPath) {
      doc.image(logoPath, hx, brandY - (SMALL_LOGO - 14) / 2, { width: SMALL_LOGO, height: SMALL_LOGO });
      hx += SMALL_LOGO + 10;
    }
    doc.fillColor(COL_ACCENT).font('Body-Bold').fontSize(28).text('docuProof.io', hx, brandY, { continued: true });
    doc.fillColor(COL_TEXT).font('Body').text(' — Proof you can point to.', { continued: false });

    // BIG right logo (no box; from same asset), vertically centered to brand row
    if (logoPath) {
      const rightX = PW - MARGIN - BIG_LOGO;
      const rightY = headerY - 10; // visual lift
      doc.image(logoPath, rightX, rightY, { width: BIG_LOGO, height: BIG_LOGO });
      // wordmark under big icon
      doc.fillColor('#ffffff').font('Body-Bold').fontSize(28)
         .text('docuProof', rightX - 4, rightY + BIG_LOGO + 6, { width: BIG_LOGO + 40, align: 'left' });
    }

    // subtle rule under header
    doc.save()
       .moveTo(MARGIN, headerY + BIG_LOGO + 18)
       .lineTo(PW - MARGIN, headerY + BIG_LOGO + 18)
       .lineWidth(1)
       .strokeColor(COL_RULE)
       .stroke()
       .restore();

    // ===== PANEL =====
    const PANEL_R   = 14;
    const PANEL_PAD = 26;

    const panelY = headerY + BIG_LOGO + 30;
    const panelX = MARGIN;
    const panelW = PW - 2 * MARGIN;
    const panelH = PH - panelY - MARGIN;

    doc.save().roundedRect(panelX, panelY, panelW, panelH, PANEL_R).fill(COL_PANEL).restore();

    // Title + subtitle in panel (the title is NOT the tagline; we already used the tagline above)
    let x = panelX + PANEL_PAD;
    let y = panelY + PANEL_PAD;

    doc.fillColor(COL_TEXT).font('Body-Bold').fontSize(TITLE_SIZE).text('Proof you can point to.', x, y);
    y += 34;

    doc.fillColor(COL_MUTED).font('Body').fontSize(12).text(
      'This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.',
      x, y, { width: panelW - 2 * PANEL_PAD - QR_BLOCK_W - COL_GAP }
    );
    y += 30;

    // Left column start
    const colX = x;
    let colY = y + 8;

    // Right QR block origin
    const qrX = panelX + panelW - PANEL_PAD - QR_BLOCK_W;
    const qrY = y;

    // Section heading
    doc.fillColor(COL_ACCENT).font('Body-Bold').fontSize(H2_SIZE).text('Proof Summary', colX, colY);
    colY += H2_SIZE + 6;

    // thin rule helper
    const rule = (rx, ry, rw) => {
      doc.save().moveTo(rx, ry).lineTo(rx + rw, ry).lineWidth(0.8).strokeColor(COL_RULE).stroke().restore();
    };

    // row helper
    const drawField = (label, value, help) => {
      rule(colX, colY, VALUE_WIDTH + LABEL_WIDTH);
      colY += ROW_RULE_SPACE;

      doc.fillColor(COL_ACCENT).font('Body-Bold').fontSize(LABEL_SIZE)
         .text(label, colX, colY, { width: LABEL_WIDTH });

      doc.fillColor(COL_TEXT).font('Body-Bold').fontSize(VALUE_SIZE)
         .text(value, colX + LABEL_WIDTH + 16, colY, { width: VALUE_WIDTH });

      colY += VALUE_SIZE + 2;
      doc.fillColor(COL_MUTED).font('Body').fontSize(HELP_SIZE)
         .text(help, colX + LABEL_WIDTH + 16, colY, { width: VALUE_WIDTH });

      colY += HELP_SIZE + LINE_GAP;
    };

    // rows
    drawField('Proof ID',        proofId,   'Your permanent reference for this proof. Keep it with your records.');
    drawField('Quick Verify ID', quickId,   '10-character code you can paste at docuProof.io/verify for fast lookups.');
    drawField('Created (UTC)',   created,   'Timestamp when this PDF was generated on the server.');
    drawField('File Name',       filename,  'Original filename you submitted for hashing.');
    drawField('Display Name',    display,   'Human-friendly name that appears on your proof.');
    drawField('Public Verify URL', verifyUrl, 'Anyone can verify this proof at any time using this URL or the Quick Verify ID above.');

    rule(colX, colY, VALUE_WIDTH + LABEL_WIDTH);

    // legal footer inside panel bottom
    doc.fillColor(COL_MUTED).font('Body').fontSize(9)
       .text(
         'docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.',
         panelX + PANEL_PAD, panelY + panelH - PANEL_PAD - 10, { width: panelW - 2 * PANEL_PAD }
       );

    // ===== QR (vector) =====
    const drawQR = (text, x0, y0, size, pad, border) => {
      doc.save().roundedRect(x0, y0, border + pad + size + pad + border, border + pad + size + pad + border, 8)
         .fill(COL_QR_PAD).restore();

      const innerX = x0 + border;
      const innerY = y0 + border;
      const innerW = pad + size + pad;
      const innerH = pad + size + pad;

      doc.save().roundedRect(innerX, innerY, innerW, innerH, 8).fill(COL_QR_PAD).restore();

      const qr = QR(4, 'M');
      qr.addData(text);
      qr.make();

      const count = qr.getModuleCount();
      const cell  = size / count;
      const beginX = innerX + pad;
      const beginY = innerY + pad;

      doc.save().fillColor(COL_QR_FG).strokeColor(COL_QR_FG);
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            const px = beginX + c * cell;
            const py = beginY + r * cell;
            doc.rect(px, py, Math.ceil(cell), Math.ceil(cell)).fill();
          }
        }
      }
      doc.restore();
    };

    drawQR(verifyUrl, qrX, qrY, QR_SIZE, QR_PAD, QR_BORDER);

    // Done
    doc.end();
    const pdf = await pdfDone;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache,no-store,must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: pdf.toString('base64'),
      isBase64Encoded: true
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'PDF build failed', detail: String(err && err.message || err) })
    };
  }
};