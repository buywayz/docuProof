// netlify/functions/proof_pdf.js
// docuProof.io — Certificate PDF (dark theme, neon accent) with transparent logo + compact QR

const fs = require("fs");
const path = require("path");
const QR = require("qrcode");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

exports.handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const proofId     = (qs.get("id") || "—").trim();
    const fileName    = (qs.get("filename") || "—").trim();
    const displayName = (qs.get("displayName") || "—").trim();
    const verifyUrl   = (qs.get("verifyUrl") || `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`).trim();
    const quickId     = (qs.get("quickId") || "—").trim();

    // Canvas
    const W = 1200, H = 800;

    // Brand palette (matching the version you liked)
    const neon  = rgb(0x16/255, 0xFF/255, 0x70/255);   // #16FF70
    const bg    = rgb(0.05, 0.06, 0.07);              // primary background
    const head  = rgb(0.06, 0.07, 0.08);              // header bar
    const panel = rgb(0.10, 0.11, 0.12);              // inner panel (subtle)
    const txt   = rgb(0.90, 0.92, 0.94);
    const sub   = rgb(0.70, 0.74, 0.78);

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([W, H]);

    const helv     = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Background + header
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: bg });
    const HEADER_H = 84;
    page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: head });

    // Transparent logo (no outline box)
    const logoPath = path.join(__dirname, "assets", "logo.png");
    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath);
      const logoImg = await pdf.embedPng(logoBytes); // preserves PNG alpha
      const L = 56; // left pad
      const logoH = 48;
      const aspect = logoImg.width / logoImg.height;
      const logoW = logoH * aspect;
      page.drawImage(logoImg, {
        x: L, y: H - HEADER_H + (HEADER_H - logoH) / 2,
        width: logoW, height: logoH
      });
    }

    // Header title
    page.drawText("docuProof.io — Proof you can point to.", {
      x: 56 + 56, // logo space + gutter
      y: H - 54,
      size: 28,
      font: helvBold,
      color: neon,
    });

    // Panel (like your screenshot)
    const PX = 52, PY = 64;
    const panelX = PX, panelY = PY;
    const panelW = W - PX*2, panelH = H - HEADER_H - PY*2 + 8;
    page.drawRectangle({
      x: panelX, y: panelY, width: panelW, height: panelH,
      color: panel, opacity: 0.85, borderWidth: 0.7, borderColor: rgb(0.18,0.20,0.22)
    });

    // Title inside panel
    let x = panelX + 28;
    let y = panelY + panelH - 48;

    page.drawText("Proof you can point to.", {
      x, y, size: 36, font: helvBold, color: txt
    });
    y -= 26;

    // Subtitle / certificate line
    page.drawText(
      "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.",
      { x, y: y - 26, size: 14, font: helv, color: sub }
    );
    y -= 26 + 28;

    // Section heading
    page.drawText("Proof Summary", { x, y, size: 20, font: helvBold, color: neon });
    y -= 18;

    // Helper to draw label + value + helper text (as in the good version)
    const LINE_GAP = 22;
    const HELP_GAP = 14;
    function field(label, value, helpText) {
      y -= 22;
      page.drawText(label, { x, y, size: 14, font: helvBold, color: neon });

      page.drawText(String(value || "—"), {
        x: x + 120, y, size: 14, font: helv, color: txt
      });

      if (helpText) {
        y -= HELP_GAP;
        page.drawText(helpText, {
          x: x + 120, y, size: 12, font: helv, color: sub
        });
      }
      y -= (LINE_GAP - HELP_GAP); // total spacing between fields
    }

    // Fields (mirror the template you liked)
    field("Proof ID", proofId, "Your permanent reference for this proof. Keep it with your records.");
    field("Quick Verify ID", quickId, "10-character code you can paste at docuProof.io/verify for fast lookups.");
    field("Created (UTC)", new Date().toISOString().replace(/\.\d{3}Z$/, "Z"));
    field("File Name", fileName);
    field("Display Name", displayName);

    // Verification (link + helper copy)
    y -= 6;
    page.drawText("Verification", { x, y, size: 14, font: helvBold, color: neon });
    y -= 22;
    page.drawText("Public Verify URL", { x, y, size: 14, font: helvBold, color: neon });
    page.drawText(verifyUrl, { x: x + 120, y, size: 14, font: helv, color: txt });
    y -= 16;
    page.drawText(
      "Anyone can verify this proof at any time using this URL or the Quick Verify ID above.",
      { x: x + 120, y, size: 12, font: helv, color: sub }
    );

    // Footer disclaimer
    const footY = panelY + 20;
    page.drawText(
      "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
      { x: panelX + 8, y: footY + 6, size: 12, font: helv, color: sub }
    );
    page.drawText("© 2025 docuProof.io — All rights reserved.", {
      x: panelX + 8, y: footY - 12, size: 12, font: helv, color: sub
    });

    // --- Compact QR bottom-right (about 140px) ---
    // Only draw if verifyUrl exists
    if (verifyUrl && verifyUrl.startsWith("http")) {
      // Generate PNG buffer from QR library
      const qrPngDataUrl = await QR.toDataURL(verifyUrl, {
        errorCorrectionLevel: "M", margin: 1, scale: 6, color: { dark: "#000000", light: "#FFFFFF00" }
      });
      const qrBytes = Buffer.from(qrPngDataUrl.split(",")[1], "base64");
      const qrImg = await pdf.embedPng(qrBytes);

      const qrSide = 140; // ~140 px target
      const qrX = panelX + panelW - qrSide - 18;
      const qrY = panelY + 18;

      page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSide, height: qrSide });
    }

    // Output
    const pdfBytes = await pdf.save();
    const fname = "docuProof-Certificate.pdf";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fname}"`,
        "Cache-Control": "no-cache"
      },
      body: Buffer.from(pdfBytes).toString("base64"),
      isBase64Encoded: true
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message || String(err) })
    };
  }
};