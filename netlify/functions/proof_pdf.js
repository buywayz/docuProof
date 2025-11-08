// netlify/functions/proof_pdf.js
// docuProof.io — PDF certificate (dark theme, neon accent) with diagnostic badge outline for logo.

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

exports.handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const proofId     = (qs.get("id") || "—").trim();
    const fileName    = (qs.get("filename") || "docuProof-Certificate.pdf").trim();
    const displayName = (qs.get("displayName") || "").trim();

    const W = 1200, H = 800;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([W, H]);

    // Brand
    const green  = rgb(0x16/255, 0xFF/255, 0x70/255); // #16FF70
    const bg1    = rgb(0.05, 0.06, 0.07);
    const bg2    = rgb(0.09, 0.10, 0.11);
    const headBg = rgb(0.06, 0.07, 0.08);
    const badge  = rgb(0.14, 0.15, 0.17);
    const txt    = rgb(0.90, 0.92, 0.94);
    const txt2   = rgb(0.70, 0.74, 0.78);

    const font     = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Background + header
    page.drawRectangle({ x:0, y:0, width:W, height:H, color:bg1 });
    const HEADER_H = 84;
    page.drawRectangle({ x:0, y:H-HEADER_H, width:W, height:HEADER_H, color:headBg });

    // Header content
    const padX = 56;
    let hx = padX;

    // --- LOGO (with diagnostic outline) ---
    // If the logo draws, you will see a dark badge with a thin GREEN outline on the left.
    const badgePad = 10;
    const LOGO_H = 40;
    const ly = H - HEADER_H + (HEADER_H - LOGO_H)/2;

    const drawBadgeOutline = (x, y, w, h) => {
      page.drawRectangle({
        x: x - badgePad,
        y: y - badgePad,
        width: w + 2*badgePad,
        height: h + 2*badgePad,
        color: badge,
        borderColor: green,     // << diagnostic outline
        borderWidth: 1.5        // << make it very visible
      });
    };

    let logoDrawn = false;
    try {
      const logoPath = path.resolve(__dirname, "assets/logo.png");
      if (fs.existsSync(logoPath)) {
        const bytes = fs.readFileSync(logoPath);
        const img = await pdf.embedPng(bytes);
        const LOGO_W = (img.width / img.height) * LOGO_H;

        drawBadgeOutline(hx, ly, LOGO_W, LOGO_H);
        page.drawImage(img, { x: hx, y: ly, width: LOGO_W, height: LOGO_H });
        hx += LOGO_W + 16;
        logoDrawn = true;
      }
    } catch { /* ignore, fallback below */ }

    if (!logoDrawn) {
      // Fallback: solid green square + tiny "dP" — you WILL see this if logo failed.
      const F_W = 40, F_H = 40;
      drawBadgeOutline(hx, ly, F_W, F_H);
      page.drawRectangle({ x: hx, y: ly, width: F_W, height: F_H, color: green });
      page.drawText("dP", { x: hx + 10, y: ly + 10, size: 16, font: fontBold, color: headBg });
      hx += F_W + 16;
    }

    page.drawText("docuProof.io — Proof you can point to.", {
      x: hx, y: H - HEADER_H + 28, size: 20, font: fontBold, color: green
    });

    // Content panel
    const panelX = padX, panelW = W - 2*padX;
    const panelY = 90,   panelH = H - HEADER_H - panelY - 48;
    page.drawRectangle({
      x: panelX, y: panelY, width: panelW, height: panelH,
      color: bg2, borderColor: rgb(0.18,0.19,0.21), borderWidth: 1
    });

    // Helpers
    const wrap = (s, f, size, maxw) => {
      const words = String(s).split(/\s+/); const out = []; let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (f.widthOfTextAtSize(test, size) <= maxw) line = test;
        else { if (line) out.push(line); line = w; }
      }
      if (line) out.push(line); return out;
    };
    let y = H - HEADER_H - 56;

    // Title + intro
    page.drawText("Proof you can point to.", { x: panelX+28, y, size: 28, font: fontBold, color: txt }); y -= 34;
    const intro = "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.";
    for (const ln of wrap(intro, font, 13, panelW - 56)) { y -= 18; page.drawText(ln, { x: panelX+28, y, size: 13, font, color: txt2 }); }
    y -= 24;

    // Section
    page.drawText("Proof Summary", { x: panelX+28, y, size: 18, font: fontBold, color: green }); y -= 26;

    const label = (s) => { page.drawText(s, { x: panelX+28, y, size: 12, font: fontBold, color: green }); };
    const val   = (s) => { page.drawText(s, { x: panelX+28, y, size: 12, font, color: txt }); };
    const note  = (s) => { page.drawText(s, { x: panelX+28, y, size: 11, font, color: txt2 }); };

    // Proof ID
    label("Proof ID"); y -= 16; val(proofId || "—"); y -= 14;
    note("Your permanent reference for this proof. Keep it with your records."); y -= 24;

    // Quick Verify ID (stable 10 chars)
    const quick = (() => {
      if (!proofId || proofId === "—") return "—";
      const crypto = require("crypto");
      return crypto.createHash("sha256").update(proofId).digest("base64url").slice(0,10);
    })();
    label("Quick Verify ID"); y -= 16; val(quick); y -= 14;
    note("10-character code you can paste at docuProof.io/verify for fast lookups."); y -= 24;

    // Created
    label("Created (UTC)"); y -= 16; val(new Date().toISOString()); y -= 24;

    // Optional fields
    const fileNameQS = (qs.get("filename") || "").trim();
    if (fileNameQS)   { label("File Name");    y -= 16; val(fileNameQS);   y -= 24; }
    if (displayName)  { label("Display Name"); y -= 16; val(displayName);  y -= 24; }

    // Verify URL
    label("Verification"); y -= 18;
    label("Public Verify URL"); y -= 16;
    const verifyUrl = proofId && proofId !== "—"
      ? `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`
      : "https://docuproof.io/verify";
    val(verifyUrl); y -= 14;
    note("Anyone can verify this proof at any time using this URL or the Quick Verify ID above.");

    // Footer
    page.drawText(
      "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
      { x: panelX, y: 56, size: 11, font, color: txt2 }
    );
    page.drawText("© 2025 docuProof.io — All rights reserved.", { x: panelX, y: 38, size: 11, font, color: txt2 });

    const bytes = await pdf.save();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`
      },
      body: Buffer.from(bytes).toString("base64"),
      isBase64Encoded: true
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ ok:false, error: e.message }) };
  }
};