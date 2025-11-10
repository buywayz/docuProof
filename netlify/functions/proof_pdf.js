// netlify/functions/proof_pdf.js
// docuProof.io — Certificate PDF (dark theme, neon accent) + compact QR (bottom-right)

const fs = require("fs");
const path = require("path");
const QR = require("qrcode");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

exports.handler = async (event) => {
  try {
    // ---- Inputs from query string (all optional with sane fallbacks) ----
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const proofId     = (qs.get("id") || "—").trim();
    const fileName    = (qs.get("filename") || "docuProof-Certificate.pdf").trim();
    const displayName = (qs.get("displayName") || "").trim();
    const quickId     = (qs.get("quickId") || "—").trim();
    const createdISO  = (qs.get("created") || new Date().toISOString()).trim();
    const verifyUrl   = (qs.get("verifyUrl") || "").trim();

    // ---- Canvas, palette, fonts (exact look that matched your "good" version) ----
    const W = 1200, H = 800;
    const NEON   = rgb(0x16 / 255, 0xFF / 255, 0x70 / 255); // #16FF70
    const BG     = rgb(0.05, 0.06, 0.07);                   // page bg
    const BG_HDR = rgb(0.06, 0.07, 0.08);                   // header bg strip
    const PANEL  = rgb(0.10, 0.11, 0.12);                   // inner panel bg
    const TXT    = rgb(0.90, 0.92, 0.94);
    const MUTED  = rgb(0.72, 0.76, 0.80);

    const pdf   = await PDFDocument.create();
    const page  = pdf.addPage([W, H]);
    const helv  = await pdf.embedFont(StandardFonts.Helvetica);
    const helvB = await pdf.embedFont(StandardFonts.HelveticaBold);

    // ---- Background + header band ----
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BG });
    const HEADER_H = 84;
    page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: BG_HDR });

    // ---- Logo (transparent PNG) + headline (unchanged styling) ----
    const padX = 56;
    let hx = padX;

    try {
      const logoPath = path.join(__dirname, "assets", "logo.png");
      const logoBuf  = fs.readFileSync(logoPath);
      const logoImg  = await pdf.embedPng(logoBuf);
      const L = 56; // logo square size
      page.drawImage(logoImg, { x: hx, y: H - HEADER_H + (HEADER_H - L) / 2, width: L, height: L });
      hx += L + 20;
    } catch (_) {
      // If the logo is missing we keep going; no box/outline is drawn.
    }

    const headline = "docuProof.io — Proof you can point to.";
    page.drawText(headline, {
      x: hx,
      y: H - HEADER_H + 26,
      size: 34,
      font: helvB,
      color: NEON,
    });

    // ---- Content panel (the light stroke box in your good screenshot) ----
    const panel = { x: padX, y: 100, w: W - padX * 2, h: H - HEADER_H - 100 - 24 };
    page.drawRectangle({
      x: panel.x, y: panel.y, width: panel.w, height: panel.h, color: PANEL, opacity: 1,
      borderWidth: 1, borderColor: rgb(0.18, 0.20, 0.22),
    });

    // ---- Title inside panel ----
    const title = "Proof you can point to.";
    page.drawText(title, {
      x: panel.x + 28,
      y: panel.y + panel.h - 54,
      size: 44,
      font: helvB,
      color: TXT,
    });

    // ---- Helper line below title (unchanged) ----
    const helper =
      "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.";
    page.drawText(helper, {
      x: panel.x + 28,
      y: panel.y + panel.h - 84,
      size: 14,
      font: helv,
      color: MUTED,
    });

    // ---- “Proof Summary” section label (green) ----
    const summaryLabel = "Proof Summary";
    page.drawText(summaryLabel, {
      x: panel.x + 28,
      y: panel.y + panel.h - 122,
      size: 22,
      font: helvB,
      color: NEON,
    });

    // ---- Left column labels/values (exact wording & spacing as your good version) ----
    const leftX   = panel.x + 28;
    let   rowY    = panel.y + panel.h - 162;
    const LBL_S   = 16;
    const VAL_S   = 16;
    const ROW_H   = 42;
    const LBL_CLR = NEON;

    function drawKV(label, value, helperLine) {
      page.drawText(label, { x: leftX, y: rowY, size: LBL_S, font: helvB, color: LBL_CLR });
      page.drawText(value, { x: leftX + 130, y: rowY, size: VAL_S, font: helv, color: TXT });
      if (helperLine) {
        rowY -= 18;
        page.drawText(helperLine, { x: leftX + 130, y: rowY, size: 12, font: helv, color: MUTED });
      }
      rowY -= ROW_H;
    }

    // Data mapping (kept identical to the “good” layout you liked)
    const verifyUrlFinal =
      (verifyUrl && verifyUrl.startsWith("http"))
        ? verifyUrl
        : (proofId && proofId !== "—"
            ? `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`
            : "");

    drawKV("Proof ID", proofId, "Your permanent reference for this proof. Keep it with your records.");
    drawKV("Quick Verify ID", quickId, "10-character code you can paste at docuProof.io/verify for fast lookups.");
    drawKV("Created (UTC)", createdISO, null);
    drawKV("File Name", fileName, null);
    drawKV("Display Name", displayName || "—", null);
    drawKV("Verification", "", null);
    // “Public Verify URL” is on its own line (value wraps long URL)
    page.drawText("Public Verify URL", { x: leftX, y: rowY, size: LBL_S, font: helvB, color: LBL_CLR });
    page.drawText(verifyUrlFinal || "—", { x: leftX + 130, y: rowY, size: VAL_S, font: helv, color: TXT });
    rowY -= ROW_H;
    page.drawText(
      "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.",
      { x: leftX + 130, y: rowY + 6, size: 12, font: helv, color: MUTED }
    );

    // ---- Footer smallprint (unchanged) ----
    page.drawText(
      "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
      { x: padX, y: 78, size: 10, font: helv, color: MUTED }
    );
    page.drawText("© 2025 docuProof.io — All rights reserved.", {
      x: padX, y: 60, size: 10, font: helv, color: MUTED,
    });

    // ---- NEW: Compact QR code in bottom-right (≈140px), transparent background ----
    try {
      if (verifyUrlFinal) {
        const qrDataUrl = await QR.toDataURL(verifyUrlFinal, {
          errorCorrectionLevel: "M",
          margin: 1,
          scale: 6,
          color: { dark: "#000000", light: "#FFFFFF00" }, // transparent light modules
        });
        const qrBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
        const qrImg   = await pdf.embedPng(qrBytes);

        const qrSide = 140;         // compact
        const qrX    = W - qrSide - 60;
        const qrY    = 60;
        page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSide, height: qrSide });
      }
    } catch (_) {
      // never break the certificate if QR generation fails
    }

    // ---- Finish + respond ----
    const bytes = await pdf.save();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
      body: Buffer.from(bytes).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: `PDF error: ${err.message || err}` };
  }
};