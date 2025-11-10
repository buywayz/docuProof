// netlify/functions/proof_pdf.js
// v4.3.2: fix pdfDoc.save(); force transparent logo_nobg.png; larger neon vector QR.
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const HEADERS_NO_CACHE = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
};

exports.handler = async (event) => {
  const trace = {
    version: 'proof_pdf v4.3.2 nobg-only + big-neon-qr',
    qr: 0,
    logo: 0,
    logo_src: 'none',
    err: '',
  };

  try {
    const qp = (event && event.queryStringParameters) ? event.queryStringParameters : {};
    const id          = qp.id || 'unknown';
    const filename    = (qp.filename || 'Proof.pdf').replace(/"/g, '');
    const displayName = qp.displayName || 'Document Proof';
    const quickId     = qp.quickId || '';
    const verifyUrl   = (qp.verifyUrl && qp.verifyUrl.trim())
      ? qp.verifyUrl
      : 'https://docuproof.io/verify?id=' + encodeURIComponent(id);

    const pdfDoc = await PDFDocument.create();
    const pageWidth = 1200, pageHeight = 630;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const charcoal = rgb(0x0b/255, 0x0d/255, 0x0f/255);
    const graphite = rgb(0x1a/255, 0x1f/255, 0x24/255);
    const neon     = rgb(0x16/255, 0xFF/255, 0x70/255);
    const white    = rgb(0xE6/255, 0xE7/255, 0xEB/255);

    // Background + frame
    page.drawRectangle({ x: 0, y: 0, width: pageWidth, height: pageHeight, color: charcoal });
    page.drawRectangle({ x: 60, y: 60, width: pageWidth - 120, height: pageHeight - 120, borderColor: graphite, borderWidth: 1, opacity: 0.6 });

    // Title + subtitle
    const title = 'Proof you can point to.';
    const titleSize = 64;
    const titleWidth = helvBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, { x: (pageWidth - titleWidth) / 2, y: 630 - 370, size: titleSize, font: helvBold, color: neon });

    const subtitle = "Because memory is fallible - timestamps aren't.";
    const subSize = 40;
    const subWidth = helvBold.widthOfTextAtSize(subtitle, subSize);
    page.drawText(subtitle, { x: (pageWidth - subWidth) / 2, y: 630 - 335, size: subSize, font: helvBold, color: white });

    // Logo: require transparent asset only
    const nobgPath = path.join(__dirname, 'assets', 'logo_nobg.png');
    if (fs.existsSync(nobgPath)) {
      try {
        const logoBytes = fs.readFileSync(nobgPath);
        const logoImg = await pdfDoc.embedPng(logoBytes); // preserves alpha
        const logoW = 200;
        const scale = logoW / logoImg.width;
        const logoH = logoImg.height * scale;
        const margin = 60;
        const logoX = margin + 8;
        const logoY = pageHeight - margin - logoH - 8;
        page.drawImage(logoImg, { x: logoX, y: logoY, width: logoW, height: logoH });
        trace.logo = 1;
        trace.logo_src = 'logo_nobg.png';
      } catch {
        trace.logo = -1; trace.logo_src = 'logo_nobg.png(embed-failed)';
      }
    } else {
      trace.logo = 0; trace.logo_src = 'MISSING: logo_nobg.png';
    }

    // Proof summary
    const left = 100; let y = 250; const lineH = 26;
    const label = (t, yy) => page.drawText(t, { x: left, y: yy, size: 14, font: helv, color: white, opacity: 0.7 });
    const value = (t, yy) => page.drawText(t, { x: left + 180, y: yy, size: 16, font: helvBold, color: white });

    label('Display Name', y);   value(displayName, y);   y -= lineH;
    label('Document ID', y);    value(id, y);            y -= lineH;
    label('Quick ID', y);       value(quickId || '—', y);y -= lineH;
    label('Verify URL', y);     value(verifyUrl, y);     y -= lineH;

    // QR: vector modules (neon), larger size
    try {
      const qr = QRCode.create(verifyUrl, { errorCorrectionLevel: 'M' });
      const modules = qr.modules;
      const size = modules.size;

      const qrSizePx = 180;
      const margin = 60;
      const qrX = pageWidth - margin - qrSizePx;
      const qrY = margin;
      const cell = qrSizePx / size;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (modules.get(c, r)) {
            page.drawRectangle({
              x: qrX