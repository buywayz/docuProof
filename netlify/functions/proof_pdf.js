// netlify/functions/proof_pdf.js
// docuProof.io — On-brand PDF proof (dark theme, neon accent, logo with contrast badge)

const fs = require("fs");
const path = require("path");
const { PDFDocument, rgb, StandardFonts } = require("pdf-lib");

exports.handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters || {});
    const proofId     = (qs.get("id") || "—").trim();
    const fileName    = (qs.get("filename") || "proof.pdf").trim();
    const displayName = (qs.get("displayName") || "").trim();

    // --- Create PDF surface ---
    const W = 1200, H = 800;
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([W, H]);

    // --- Brand palette (matches site) ---
    const green  = rgb(0x16/255, 0xFF/255, 0x70/255);   // #16FF70
    const bg1    = rgb(0.05, 0.06, 0.07);               // page background (very dark)
    const bg2    = rgb(0.09, 0.10, 0.11);               // content panel fill
    const headBg = rgb(0.06, 0.07, 0.08);               // header bar
    const badge  = rgb(0.14, 0.15, 0.17);               // logo badge (lighter than header)
    const text   = rgb(0.90, 0.92, 0.94);
    const text2  = rgb(0.70, 0.74, 0.78);

    // --- Fonts ---
    const font     = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Fill whole page (gives nice dark frame when viewers print to PDF viewers)
    page.drawRectangle({ x:0, y:0, width:W, height:H, color:bg1 });

    // --- Header ---
    const HEADER_H = 84;
    page.drawRectangle({ x:0, y:H-HEADER_H, width:W, height:HEADER_H, color:headBg });

    const padX = 56;
    let hx = padX;

    // Try to load logo; draw on a contrast badge so it pops on dark header
    let haveLogo = false;
    try {
      const logoPath = path.resolve(__dirname, "assets/logo.png");
      if (fs.existsSync(logoPath)) {
        const bytes = fs.readFileSync(logoPath);
        const img = await pdf.embedPng(bytes);
        const LOGO_H = 40;
        const LOGO_W = (img.width / img.height) * LOGO_H;
        const ly = H - HEADER_H + (HEADER_H - LOGO_H)/2;

        // badge behind logo
        const badgePad = 10;
        page.drawRectangle({
          x: hx - badgePad,
          y: ly - badgePad,
          width: LOGO_W + 2*badgePad,
          height: LOGO_H + 2*badgePad,
          color: badge,
          borderColor: rgb(0.18,0.19,0.21),
          borderWidth: 0.5
        });

        page.drawImage(img, { x: hx, y: ly, width: LOGO_W, height: LOGO_H });
        hx += LOGO_W + 16;
        haveLogo = true;
      }
    } catch { /* ignore; fallback below */ }

    if (!haveLogo) {
      // Fallback monogram “dP” so header never looks empty
      const MONO_H = 40;
      const ly = H - HEADER_H + (HEADER_H - MONO_H)/2;
      page.drawRectangle({
        x: hx - 10, y: ly - 10, width: 56, height: MONO_H + 20, color: badge
      });
      page.drawText("dP", { x: hx, y: ly + 8, size: 28, font: fontBold, color: green });
      hx += 56 + 16;
    }

    page.drawText("docuProof.io — Proof you can point to.", {
      x: hx, y: H - HEADER_H + 28, size: 20, font: fontBold, color: green
    });

    // --- Content panel ---
    const panelX = padX, panelW = W - 2*padX;
    const panelY = 90,   panelH = H - HEADER_H - panelY - 48;

    page.drawRectangle({
      x: panelX, y: panelY, width: panelW, height: panelH, color: bg2,
      borderColor: rgb(0.18,0.19,0.21), borderWidth: 1
    });

    // Content helpers
    const wrap = (s, f, size, maxw) => {
      const words = String(s).split(/\s+/);
      const out = []; let line = "";
      for (const w of words) {
        const test = line ? line + " " + w : w;
        if (f.widthOfTextAtSize(test, size) <= maxw) line = test;
        else { if (line) out.push(line); line = w; }
      }
      if (line) out.push(line);
      return out;
    };

    const LBL  = (lbl) => page.drawText(lbl, { x: panelX+28, y, size: 12, font: fontBold, color: green });
    const VAL  = (val) => page.drawText(val, { x: panelX+28, y, size: 12, font, color: text  });
    const NOTE = (val) => page.drawText(val, { x: panelX+28, y, size: 11, font, color: text2 });

    let y = H - HEADER_H - 56;
    page.drawText("Proof you can point to.", { x: panelX+28, y, size: 28, font: fontBold, color: text });
    y -= 34;

    const intro = "This certificate confirms your document was cryptographically hashed and queued for permanent timestamping on Bitcoin.";
    for (const ln of wrap(intro, font, 13, panelW - 56)) { y -= 18; page.drawText(ln, { x: panelX+28, y, size: 13, font, color: text2 }); }
    y -= 24;

    page.drawText("Proof Summary", { x: panelX+28, y, size: 18, font: fontBold, color: green });
    y -= 26;

    // Proof ID
    LBL("Proof ID"); y -= 16; VAL(proofId || "—"); y -= 14;
    NOTE("Your permanent reference for this proof. Keep it with your records."); y -= 24;

    // Quick Verify ID (stable 10-char from proofId)
    const quick = (() => {
      if (!proofId || proofId === "—") return "—";
      const crypto = require("crypto");
      const dig = crypto.createHash("sha256").update(proofId).digest("base64url");
      return dig.slice(0, 10);
    })();
    LBL("Quick Verify ID"); y -= 16; VAL(quick); y -= 14;
    NOTE("10-character code you can paste at docuProof.io/verify for fast lookups."); y -= 24;

    // Created
    LBL("Created (UTC)"); y -= 16; VAL(new Date().toISOString()); y -= 24;

    // Optional fields
    if (fileName)    { LBL("File Name");     y -= 16; VAL(fileName);    y -= 24; }
    if (displayName) { LBL("Display Name");  y -= 16; VAL(displayName); y -= 24; }

    // Verify URL (canonical short path)
    const verifyUrl = proofId && proofId !== "—"
      ? `https://docuproof.io/verify?id=${encodeURIComponent(proofId)}`
      : "https://docuproof.io/verify";
    LBL("Verification"); y -= 18;
    LBL("Public Verify URL"); y -= 16; VAL(verifyUrl); y -= 14;
    NOTE("Anyone can verify anytime using this URL or the Quick Verify ID above.");

    // Footer
    page.drawText(
      "docuProof batches proofs to Bitcoin for tamper-evident timestamping. docuProof is not a notary and does not provide legal attestation.",
      { x: panelX, y: 56, size: 11, font, color: text2 }
    );
    page.drawText("© 2025 docuProof.io — All rights reserved.", { x: panelX, y: 38, size: 11, font, color: text2 });

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