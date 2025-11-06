// netlify/functions/proof_pdf.js
// Branded PDF "Proof Certificate" (headline: "Proof you can point to.")
// Pulls live status from /.netlify/functions/verify?id=<proofId>

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

function siteOrigin(event) {
  const url =
    process.env.URL ||
    (event.headers && event.headers.host && `https://${event.headers.host}`) ||
    "";
  return url.replace(/\/$/, "");
}

// Tiny helpers
const drawText = (page, text, x, y, size, font, color) =>
  page.drawText(String(text), { x, y, size, font, color });

function drawRow(page, opts) {
  const {
    x, y, label, value,
    labelColor = rgb(0.60, 0.64, 0.68),
    valueColor = rgb(0.90, 0.91, 0.92),
    labelSize = 10, valueSize = 12,
    font, wrapWidth = 440, lineGap = 4,
  } = opts;

  drawText(page, label, x, y, labelSize, font, labelColor);

  const words = String(value ?? "—").split(/\s+/);
  let line = "";
  let yy = y - (labelSize + 2);
  const measure = (s) => font.widthOfTextAtSize(s, valueSize);
  const max = wrapWidth;

  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (measure(test) > max) {
      drawText(page, line, x, yy, valueSize, font, valueColor);
      yy -= (valueSize + lineGap);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) {
    drawText(page, line, x, yy, valueSize, font, valueColor);
    yy -= (valueSize + lineGap);
  }
  return yy;
}

exports.handler = async (event) => {
  try {
    const params = new URLSearchParams(event.queryStringParameters || {});
    const proofId = (params.get("id") || "").trim();
    if (!proofId) return { statusCode: 400, body: "Missing id" };

    const origin = siteOrigin(event);
    const verifyUrl = `${origin}/.netlify/functions/verify_page?id=${encodeURIComponent(proofId)}`;

    // Pull verification data (best-effort)
    let v = null;
    try {
      const r = await fetch(`${origin}/.netlify/functions/verify?id=${encodeURIComponent(proofId)}`);
      if (r.ok) v = await r.json();
    } catch (_) {}

    const state = v?.state ? String(v.state).toUpperCase() : "UNKNOWN";
    const txid = v?.txid || null;
    const confirmations = (typeof v?.confirmations === "number") ? v.confirmations : null;
    const hash = v?.hash || null;
    const ts = v?.timestamp || v?.anchoredAt || v?.submittedAt || new Date().toISOString();

    // Colors (dark theme)
    const bg = rgb(0.043, 0.051, 0.059);        // #0b0d0f
    const panel = rgb(0.071, 0.086, 0.105);     // #12161b
    const line = rgb(0.102, 0.122, 0.141);      // #1a1f24
    const accent = rgb(0.086, 1.0, 0.439);      // #16FF70
    const text = rgb(0.902, 0.905, 0.922);      // #E6E7EB
    const muted = rgb(0.604, 0.643, 0.678);     // #9aa4ad

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]); // Letter
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Background
    page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: bg });

    // Header
    page.drawRectangle({ x: 40, y: 720, width: 532, height: 40, color: panel, borderColor: line, borderWidth: 1 });
    drawText(page, "docuProof.io — Proof Certificate", 56, 734, 14, fontBold, text);
    drawText(page, new Date(ts).toLocaleString(), 56, 718, 10, font, muted);

    // Title (THIS is the new headline)
    drawText(page, "Proof you can point to.", 40, 680, 22, fontBold, accent);

    // Summary
    page.drawRectangle({ x: 40, y: 560, width: 532, height: 96, color: panel, borderColor: line, borderWidth: 1, borderRadius: 6 });
    drawText(page, "Proof ID", 56, 634, 10, font, muted);
    drawText(page, proofId, 56, 618, 14, fontBold, text);

    drawText(page, "Status", 320, 634, 10, font, muted);
    const stateLabel =
      state === "ANCHORED" ? "Anchored on Bitcoin" :
      (state === "ANCHORING" || state === "SUBMITTED") ? "Anchoring in progress" :
      state === "NOT_FOUND" ? "Not found" : state;
    drawText(page, stateLabel, 320, 618, 14, fontBold, text);

    // Explanation
    const explTop = 520;
    page.drawRectangle({ x: 40, y: explTop - 116, width: 532, height: 116, color: panel, borderColor: line, borderWidth: 1, borderRadius: 6 });
    let y = explTop;
    drawText(page, "What this certificate means", 56, y + 88, 12, fontBold, text);

    y = drawRow(page, {
      x: 56, y: y + 68, label: "Summary",
      value:
        "This certificate confirms your document was cryptographically hashed and timestamped with docuProof.io. " +
        "We batch proofs and anchor them to the Bitcoin blockchain for permanence.",
      font, wrapWidth: 500, labelColor: muted, valueColor: text
    });

    y = drawRow(page, {
      x: 56, y: y - 4, label: "Verify anytime",
      value: `${verifyUrl}`,
      font, wrapWidth: 500, labelColor: muted, valueColor: text
    });

    const timing = state === "ANCHORED"
      ? "This proof is anchored and verifiable on-chain."
      : "If you just completed your purchase, anchoring typically completes within 10–60 minutes.";
    y = drawRow(page, {
      x: 56, y: y - 4, label: "Anchoring",
      value: timing,
      font, wrapWidth: 500, labelColor: muted, valueColor: text
    });

    // Details
    const detTop = 360;
    page.drawRectangle({ x: 40, y: detTop - 210, width: 532, height: 210, color: panel, borderColor: line, borderWidth: 1, borderRadius: 6 });
    drawText(page, "Details", 56, detTop - 24, 12, fontBold, text);

    let detY = detTop - 46;
    detY = drawRow(page, { x: 56, y: detY, label: "Status", value: stateLabel, font, wrapWidth: 500, labelColor: muted, valueColor: text });

    if (hash) {
      detY = drawRow(page, {
        x: 56, y: detY - 4, label: "Document hash (truncated)",
        value: (hash.length > 64 ? hash.slice(0, 64) + "…" : hash),
        font, wrapWidth: 500, labelColor: muted, valueColor: text
      });
    }

    if (txid) {
      detY = drawRow(page, { x: 56, y: detY - 4, label: "Bitcoin TxID", value: txid, font, wrapWidth: 500, labelColor: muted, valueColor: text });
      if (typeof confirmations === "number") {
        detY = drawRow(page, { x: 56, y: detY - 4, label: "Confirmations", value: String(confirmations), font, wrapWidth: 500, labelColor: muted, valueColor: text });
      }
    }

    // Footer
    drawText(page, "docuProof.io — Blockchain Proof of Existence Service", 40, 36, 10, font, muted);
    drawText(page, origin, 40, 22, 10, font, rgb(0.54, 0.70, 1.0));

    const bytes = await pdf.save();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${proofId}-certificate.pdf"`,
        "Cache-Control": "no-store",
      },
      body: Buffer.from(bytes).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("proof_pdf error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
