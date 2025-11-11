// netlify/functions/proof_pdf.js
// PDF proof renderer — compact, readable, Acrobat-safe
// Layout: Letter landscape, dark panel, small header logo (left), no large right logo,
// helper text under each value, smaller consistent typography, compact row spacing,
// smaller QR with light-green pad & border.

const PDFDocument = require('pdfkit');
const { Buffer } = require('buffer');
const fs = require('fs');
const path = require('path');
const QR = require('qrcode-generator'); // pure JS (no native deps)

exports.handler = async (event) => {
  try {
    // -------- Parse inputs (querystring) --------
    const q = new URLSearchParams(event.rawQuery || event.queryStringParameters || {});
    const proofId   = q.get('id')          || 'qr_fix01';
    const quickId   = q.get('quickId')     || '00000000';
    const created   = q.get('createdUtc')  || new Date().toISOString();
    const filename  = q.get('filename')    || 'Launch-Test.pdf';
    const display   = q.get('displayName') || 'Launch Sync Test';
    const verifyUrl = q.get('verifyUrl')   || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;

    // -------- Colors & constants (match your brand) --------
    const COL_BG          = '#0b0d0f';  // page bg
    const COL_PANEL       = '#151a1f';  // card bg
    const COL_RULE        = '#2a3138';
    const COL_TEXT        = '#e6e7eb';
    const COL_MUTED       = '#9aa2ab';
    const COL_ACCENT      = '#16FF70';
    const COL_QR_PAD      = '#82ffa6';  // lighter green pad
    const COL_QR_FG       = '#000000';  // QR modules
    const COL_QR_BG       = '#82ffa6';  // QR inner background

    const PAGE_SIZE       = 'LETTER';
    const LAYOUT          = 'landscape';
    const MARGIN          = 36;           // page outer
    const PANEL_R         = 14;           // panel corner radius
    const PANEL_PAD       = 26;           // inner padding

    // Typography (smaller, consistent)
    const TITLE_SIZE      = 28;           // “Proof you can point to.”
    const H2_SIZE         = 18;           // “Proof Summary”
    const LABEL_SIZE      = 11.5;
    const VALUE_SIZE      = 14;           // slightly larger for value
    const HELP_SIZE       = 9.5;          // helper line
    const LINE_GAP        = 6;            // gap between helper/value block and next rule
    const COL_GAP         = 28;           // gap between left text column & QR block
    const ROW_RULE_SPACE  = 10;           // above/below rule
    const LABEL_WIDTH     = 130;          // left label column
    const VALUE_WIDTH     = 520;          // right value column

    // QR sizing (smaller than before)
    const QR_SIZE         = 240;          // square content
    const QR_PAD          = 18;           // soft pad
    const QR_BORDER       = 18;           // outer border thickness
    const QR_BLOCK_W      = QR_BORDER + QR_PAD + QR_SIZE + QR_PAD + QR_BORDER;

    // Small header logo (left)
    const LOGO_SIZE       = 18;           // small mark next to brand
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
      pdfVersion: '1.3' // conservative for Acrobat
    });

    // Use Helvetica AFM family you bundled
    const fontsDir = path.join(__dirname, 'data');
    const hasAFM = fs.existsSync(path.join(fontsDir, 'Helvetica.afm'));
    if (hasAFM) {
      doc.registerFont('Body', 'Helvetica');
      doc.registerFont('Body-Bold', 'Helvetica-Bold');
      doc.registerFont('Body-Oblique', 'Helvetica-Oblique');
    } else {
      // Fall back gracefully
      doc.registerFont('Body', 'Helvetica');
      doc.registerFont('Body-Bold', 'Helvetica-Bold');
      doc.registerFont('Body-Oblique', 'Helvetica-Oblique');
    }

    // Collect into buffer
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    const pdfDone = new Promise(res => doc.on('end', () => res(Buffer.concat(chunks))));

    // Page background
    const { width: PW, height: PH } = doc.page;
    doc.save()
      .rect(0, 0, PW, PH)
      .fill(COL_BG)
      .restore();

    // Panel
    const panelX = MARGIN;
    const panelY = MARGIN + 36; // leave space for header brand line
    const panelW = PW - MARGIN * 2;
    const panelH = PH - panelY - MARGIN;

    doc.save()
      .roundedRect(panelX, panelY, panelW, panelH, PANEL_R)
      .fill(COL_PANEL)
      .restore();

    // Header brand row (mini logo at left; NO big right logo)
    const brandY = MARGIN + 6;
    let cursorX = MARGIN;

    if (logoPath) {
      doc.image(logoPath, cursorX, brandY - (LOGO_SIZE - 14) / 2, { width: LOGO_SIZE, height: LOGO_SIZE });
      cursorX += LOGO_SIZE + 10;
    }

    doc.fillColor(COL_ACCENT)
       .font('Body-Bold')
       .fontSize(20)
       .text('docuProof.io', cursorX, brandY, { continued: true });

    doc.fillColor(COL_TEXT)
       .font('Body')
       .text(' — Proof you can point to.');

    // Title in panel
    let x = panelX + PANEL_PAD;
    let y = panelY + PANEL_PAD;

    doc.fillColor(COL_TEXT)
       .font('Body-Bold')
       .fontSize(TITLE_SIZE)
       .text('Proof you can point to.', x, y);

    y += 34; // below title

    // Subtitle
    doc.fillColor(COL_MUTED)
       .font('Body')
       .fontSize(12)
       .text(
        'This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.',
        x, y, { width: panelW - 2 * PANEL_PAD - QR_BLOCK_W - COL_GAP }
       );

    // Move below subtitle
    y += 30;

    // Left column origin (labels/values)
    const colX = x;
    let colY = y + 8;

    // Right QR block origin (vertically aligned with Proof Summary)
    const qrX = panelX + panelW - PANEL_PAD - QR_BLOCK_W;
    const qrY = y; // align to top of section

    // Section heading + rule
    doc.fillColor(COL_ACCENT)
       .font('Body-Bold')
       .fontSize(H2_SIZE)
       .text('Proof Summary', colX, colY);

    colY += H2_SIZE + 6;

    // helper to draw a thin rule
    const rule = (rx, ry, rw) => {
      doc.save()
         .moveTo(rx, ry)
         .lineTo(rx + rw, ry)
         .lineWidth(0.8)
         .strokeColor(COL_RULE)
         .stroke()
         .restore();
    };

    // helper: one field row (label, value, helper)
    const drawField = (label, value, help) => {
      // rule above
      rule(colX, colY, VALUE_WIDTH + LABEL_WIDTH);

      colY += ROW_RULE_SPACE;

      // label
      doc.fillColor(COL_ACCENT)
         .font('Body-Bold')
         .fontSize(LABEL_SIZE)
         .text(label, colX, colY, { width: LABEL_WIDTH });

      // value
      doc.fillColor(COL_TEXT)
         .font('Body-Bold')
         .fontSize(VALUE_SIZE)
         .text(value, colX + LABEL_WIDTH + 16, colY, { width: VALUE_WIDTH });

      // helper
      colY += VALUE_SIZE + 2;
      doc.fillColor(COL_MUTED)
         .font('Body')
         .fontSize(HELP_SIZE)
         .text(help, colX + LABEL_WIDTH + 16, colY, { width: VALUE_WIDTH });

      // advance to next row
      colY += HELP_SIZE + LINE_GAP;
    };

    // Rows (labels + helpers as requested)
    drawField('Proof ID',        proofId,   'Your permanent reference for this proof. Keep it with your records.');
    drawField('Quick Verify ID', quickId,   '10-character code you can paste at docuProof.io/verify for fast lookups.');
    drawField('Created (UTC)',   created,   'Timestamp when this PDF was generated on the server.');
    drawField('File Name',       filename,  'Original filename you submitted for hashing.');
    drawField('Display Name',    display,   'Human-friendly name that appears on your proof.');
    drawField('Public Verify URL', verifyUrl, 'Anyone can verify this proof at any time using this URL or the Quick Verify ID above.');

    // bottom rule under last row
    rule(colX, colY, VALUE_WIDTH + LABEL_WIDTH);

    // Legal footer (single line, inside panel bottom)
    doc.fillColor(COL_MUTED)
       .font('Body')
       .fontSize(9)
       .text(
         'docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.',
         panelX + PANEL_PAD, panelY + panelH - PANEL_PAD - 10, { width: panelW - 2 * PANEL_PAD }
       );

    // -------- QR: draw vector modules (no raster; Acrobat-safe) --------
    const drawQR = (text, x0, y0, size, pad, border) => {
      // outer border
      doc.save()
         .roundedRect(x0, y0, border + pad + size + pad + border, border + pad + size + pad + border, 8)
         .fill(COL_QR_PAD)
         .restore();

      // inner bg
      const innerX = x0 + border;
      const innerY = y0 + border;
      const innerW = pad + size + pad;
      const innerH = pad + size + pad;

      doc.save()
         .roundedRect(innerX, innerY, innerW, innerH, 8)
         .fill(COL_QR_PAD)
         .restore();

      // QR modules
      const qr = QR(4, 'M');  // typeNumber auto, errorCorrectionLevel M
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

    // -------- Done --------
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
      body: JSON.stringify({
        ok: false,
        error: 'PDF build failed',
        detail: String(err && err.message || err)
      })
    };
  }
};