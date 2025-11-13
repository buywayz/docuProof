// netlify/functions/proof_pdf.js
// Clean launch layout using pdfkit + qrcode-generator
// - Landscape LETTER
// - Single header line: "docuProof.io — Proof you can point to."
// - Dark rounded panel, left column fields + helper text, QR on right
// - No large right-side logo; only small mark in header
// - Acrobat-safe: PDF 1.3, streamed to base64

const PDFDocument = require('pdfkit');
const QR = require('qrcode-generator');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

exports.handler = async (event) => {
  try {
    // ---------- Parse query params ----------
    const rawQuery = event.rawQuery || "";
    const qs = new URLSearchParams(
      rawQuery || event.queryStringParameters || {}
    );

    const proofId   = qs.get("id")          || "qr_fix01";
    const quickIdIn = qs.get("quickId");
    const created   = qs.get("createdUtc")  || new Date().toISOString();
    const filename  = qs.get("filename")    || "Launch-Test.pdf";
    const display   = qs.get("displayName") || "Launch Sync Test";
    const verifyUrl = qs.get("verifyUrl")   ||
      `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`;

    // Deterministic fallback Quick Verify ID if not provided
    let quickId = quickIdIn;
    if (!quickId) {
      const digest = crypto.createHash("sha256").update(proofId).digest("base64url");
      quickId = digest.slice(0, 8);
    }

    // ---------- Colors & layout constants ----------
    const COL_BG     = "#050607";
    const COL_PANEL  = "#11161c";
    const COL_RULE   = "#272e36";
    const COL_TEXT   = "#e6e7eb";
    const COL_MUTED  = "#a0a7b0";
    const COL_ACCENT = "#16FF70";
    const COL_QR_PAD = "#82ffa6";
    const COL_QR_FG  = "#000000";

    const PAGE_SIZE  = "LETTER";
    const LAYOUT     = "landscape";
    const MARGIN     = 36;
    const PANEL_R    = 14;
    const PANEL_PAD  = 26;

    // Typography
    const BRAND_SIZE = 20;
    const TITLE_SIZE = 28;
    const SUB_SIZE   = 12;
    const H2_SIZE    = 18;
    const LABEL_SIZE = 11;
    const VALUE_SIZE = 13;
    const HELP_SIZE  = 9;

    const LABEL_W    = 130;
    const VALUE_W    = 520;
    const RULE_GAP   = 8;
    const ROW_GAP    = 10;
    const COL_GAP    = 32;

    // QR geometry
    const QR_SIZE   = 220;
    const QR_PAD    = 18;
    const QR_BORDER = 18;
    const QR_BLOCK  = QR_BORDER + QR_PAD + QR_SIZE + QR_PAD + QR_BORDER;

    // Small header logo
    const LOGO_SIZE = 18;
    const LOGO_PATHS = [
      path.join(__dirname, "assets", "logo_nobg.png"),
      path.join(__dirname, "assets", "logo.png"),
    ];
    const logoPath = LOGO_PATHS.find(p => fs.existsSync(p));

    // ---------- Create PDF ----------
    const doc = new PDFDocument({
      size: PAGE_SIZE,
      layout: LAYOUT,
      margins: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      pdfVersion: "1.3"
    });

    // Streams -> buffer
    const chunks = [];
    doc.on("data", c => chunks.push(c));
    const pdfDone = new Promise(res => doc.on("end", () => res(Buffer.concat(chunks))));

    // Built-in Helvetica family
    doc.registerFont("Body", "Helvetica");
    doc.registerFont("Body-Bold", "Helvetica-Bold");

    // Page background
    const PW = doc.page.width;
    const PH = doc.page.height;

    doc.save()
      .rect(0, 0, PW, PH)
      .fill(COL_BG)
      .restore();

    // Panel
    const panelX = MARGIN;
    const panelY = MARGIN + 36; // space above for header
    const panelW = PW - MARGIN * 2;
    const panelH = PH - panelY - MARGIN;

    doc.save()
      .roundedRect(panelX, panelY, panelW, panelH, PANEL_R)
      .fill(COL_PANEL)
      .restore();

    // ---------- Header row (mini logo + brand tagline only) ----------
    const brandY = MARGIN + 8;
    let headerX = MARGIN;

    if (logoPath) {
      doc.image(logoPath, headerX, brandY - (LOGO_SIZE - 14) / 2, {
        width: LOGO_SIZE,
        height: LOGO_SIZE
      });
      headerX += LOGO_SIZE + 10;
    }

    doc
      .fillColor(COL_ACCENT)
      .font("Body-Bold")
      .fontSize(BRAND_SIZE)
      .text("docuProof.io", headerX, brandY, { continued: true })
      .fillColor(COL_TEXT)
      .font("Body")
      .text(" — Proof you can point to.");

    // divider line under header
    doc.save()
      .moveTo(MARGIN, brandY + BRAND_SIZE + 8)
      .lineTo(PW - MARGIN, brandY + BRAND_SIZE + 8)
      .strokeColor(COL_RULE)
      .lineWidth(0.8)
      .stroke()
      .restore();

    // ---------- Title + subtitle inside panel ----------
    let x = panelX + PANEL_PAD;
    let y = panelY + PANEL_PAD;

    doc
      .fillColor(COL_TEXT)
      .font("Body-Bold")
      .fontSize(TITLE_SIZE)
      .text("Proof you can point to.", x, y);

    y += TITLE_SIZE + 8;

    const subtitle =
      "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.";

    doc
      .fillColor(COL_MUTED)
      .font("Body")
      .fontSize(SUB_SIZE)
      .text(subtitle, x, y, {
        width: panelW - 2 * PANEL_PAD - QR_BLOCK - COL_GAP
      });

    y += SUB_SIZE * 2.4; // drop below subtitle

    // ---------- Layout columns ----------
    const colX = x;
    let colY = y + 10;

    const qrX = panelX + panelW - PANEL_PAD - QR_BLOCK;
    const qrY = y; // align roughly with summary heading

    // helper: horizontal rule
    const rule = () => {
      doc.save()
        .moveTo(colX, colY)
        .lineTo(colX + LABEL_W + VALUE_W, colY)
        .lineWidth(0.8)
        .strokeColor(COL_RULE)
        .stroke()
        .restore();
    };

    // Section heading
    doc
      .fillColor(COL_ACCENT)
      .font("Body-Bold")
      .fontSize(H2_SIZE)
      .text("Proof Summary", colX, colY);

    colY += H2_SIZE + 4;

    // helper: one row (label + value + helper text), no overlap using heightOfString
    const drawField = (label, value, help) => {
      rule();
      colY += RULE_GAP;

      // label
      doc
        .fillColor(COL_ACCENT)
        .font("Body-Bold")
        .fontSize(LABEL_SIZE)
        .text(label, colX, colY, { width: LABEL_W });

      // value
      const valX = colX + LABEL_W + 16;
      doc
        .fillColor(COL_TEXT)
        .font("Body-Bold")
        .fontSize(VALUE_SIZE)
        .text(value, valX, colY, { width: VALUE_W });

      const valueHeight = doc.heightOfString(String(value), {
        width: VALUE_W,
        align: "left"
      });

      // helper
      let helperHeight = 0;
      if (help) {
        const helperY = colY + valueHeight + 2;
        doc
          .fillColor(COL_MUTED)
          .font("Body")
          .fontSize(HELP_SIZE)
          .text(help, valX, helperY, { width: VALUE_W });

        helperHeight = doc.heightOfString(String(help), {
          width: VALUE_W,
          align: "left"
        });
      }

      colY += valueHeight + helperHeight + ROW_GAP;
    };

    // ---------- Rows ----------
    drawField(
      "Proof ID",
      proofId,
      "Your permanent reference for this proof. Keep it with your records."
    );

    drawField(
      "Quick Verify ID",
      quickId,
      "10-character code you can paste at docuProof.io/verify for fast lookups."
    );

    drawField(
      "Created (UTC)",
      created,
      "Timestamp when this PDF was generated on the server."
    );

    drawField(
      "File Name",
      filename,
      "Original filename you submitted for hashing."
    );

    drawField(
      "Display Name",
      display,
      "Human-friendly name that appears on your proof."
    );

    drawField(
      "Public Verify URL",
      verifyUrl,
      "Anyone can verify this proof at any time using this URL or the Quick Verify ID above."
    );

    // bottom rule under last row
    rule();

    // Legal footer inside panel bottom
    doc
      .fillColor(COL_MUTED)
      .font("Body")
      .fontSize(9)
      .text(
        "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
        panelX + PANEL_PAD,
        panelY + panelH - PANEL_PAD - 10,
        { width: panelW - 2 * PANEL_PAD }
      );

    // ---------- QR drawing (vector, not raster) ----------
    const drawQR = (text, x0, y0, size, pad, border) => {
      const totalW = border + pad + size + pad + border;
      const totalH = totalW;

      // outer rounded tile
      doc.save()
        .roundedRect(x0, y0, totalW, totalH, 10)
        .fill(COL_QR_PAD)
        .restore();

      const innerX = x0 + border;
      const innerY = y0 + border;
      const innerW = pad + size + pad;
      const innerH = innerW;

      doc.save()
        .roundedRect(innerX, innerY, innerW, innerH, 10)
        .fill(COL_QR_PAD)
        .restore();

      // QR modules
      const qr = QR(4, "M"); // type auto
      qr.addData(text);
      qr.make();

      const count = qr.getModuleCount();
      const cell  = size / count;
      const startX = innerX + pad;
      const startY = innerY + pad;

      doc.save().fillColor(COL_QR_FG);

      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.isDark(r, c)) {
            const px = startX + c * cell;
            const py = startY + r * cell;
            doc.rect(px, py, Math.ceil(cell), Math.ceil(cell)).fill();
          }
        }
      }
      doc.restore();
    };

    drawQR(verifyUrl, qrX, qrY, QR_SIZE, QR_PAD, QR_BORDER);

    // ---------- Finish ----------
    doc.end();
    const pdf = await pdfDone;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-cache,no-store,must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      },
      body: pdf.toString("base64"),
      isBase64Encoded: true
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "PDF build failed",
        detail: String(err && err.message || err)
      })
    };
  }
};