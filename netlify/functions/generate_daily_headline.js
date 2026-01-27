// netlify/functions/generate_daily_headline.js
// Scheduled function that runs daily at 9am EST to generate "Today in History" PDF

const fs = require("fs");
const PDFDocument = require("pdfkit");
const { getStore } = require("@netlify/blobs");

function inch(n) { return n * 72; }

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatShortDate(date) {
  return date.toISOString().split('T')[0];
}

function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

async function fetchHeadlines() {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    return [
      "Breaking: Major developments in global markets today",
      "Technology sector sees significant shifts amid new policies",
      "World leaders gather for international summit discussions"
    ];
  }
  try {
    const response = await fetch(
      `https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=${apiKey}`
    );
    if (!response.ok) throw new Error(`NewsAPI error: ${response.status}`);
    const data = await response.json();
    if (data.articles && data.articles.length > 0) {
      return data.articles.slice(0, 3).map(a => a.title.replace(/\s*[-|]\s*[^-|]+$/, '').trim());
    }
    throw new Error("No articles");
  } catch (err) {
    return ["Headlines temporarily unavailable", "Check docuproof.io", "Timestamp any document today"];
  }
}

async function fetchWeather() {
  const apiKey = process.env.OPENWEATHER_KEY;
  if (!apiKey) return { temp: "45°F", condition: "Partly Cloudy", city: "New York" };
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=New%20York,US&units=imperial&appid=${apiKey}`
    );
    if (!response.ok) throw new Error(`Weather error: ${response.status}`);
    const data = await response.json();
    return {
      temp: `${Math.round(data.main.temp)}°F`,
      condition: data.weather[0]?.main || "Unknown",
      city: "New York"
    };
  } catch (err) {
    return { temp: "--°F", condition: "Unavailable", city: "New York" };
  }
}

async function generatePDF(date, headlines, weather) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 0,
      autoFirstPage: false
    });

    const chunks = [];
    doc.on("data", c => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Add single page manually
    doc.addPage({ size: "LETTER", margin: 0 });

    const W = 612;
    const H = 792;
    const dateId = date.toISOString().split('T')[0].replace(/-/g, '');

    // Colors
    const bg = "#0a0d10";
    const card = "#12161c";
    const accent = "#22c55e";
    const white = "#ffffff";
    const muted = "#8b949e";
    const dim = "#6b7280";
    const border = "#21262d";

    // Background
    doc.rect(0, 0, W, H).fill(bg);

    // Border
    doc.lineWidth(1).strokeColor(border)
       .roundedRect(28, 28, W - 56, H - 56, 8).stroke();

    // Corner accents
    doc.lineWidth(2).strokeColor(accent);
    doc.moveTo(28, 56).lineTo(28, 28).lineTo(56, 28).stroke();
    doc.moveTo(W - 56, 28).lineTo(W - 28, 28).lineTo(W - 28, 56).stroke();
    doc.moveTo(28, H - 56).lineTo(28, H - 28).lineTo(56, H - 28).stroke();
    doc.moveTo(W - 56, H - 28).lineTo(W - 28, H - 28).lineTo(W - 28, H - 56).stroke();

    // Collectible number
    doc.font("Helvetica-Bold").fontSize(9).fillColor(accent)
       .text(`#${dateId}`, W - 100, 38, { width: 70, align: "right" });

    // Logo placeholder
    doc.roundedRect(W/2 - 20, 55, 40, 40, 6).fillAndStroke(card, accent);
    doc.fontSize(8).fillColor(accent).text("docuProof", W/2 - 20, 70, { width: 40, align: "center" });

    // Brand
    doc.font("Helvetica-Bold").fontSize(18).fillColor(accent)
       .text("docuProof", 0, 110, { width: W, align: "center" });
    doc.font("Helvetica-Oblique").fontSize(9).fillColor(muted)
       .text("Proof you can point to.", 0, 132, { width: W, align: "center" });

    // Title
    doc.font("Helvetica-Bold").fontSize(28).fillColor(white)
       .text("TODAY IN HISTORY", 0, 165, { width: W, align: "center" });

    // Date
    doc.font("Helvetica-Bold").fontSize(20).fillColor(accent)
       .text(formatDate(date), 0, 205, { width: W, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(dim)
       .text(`Generated at ${formatTime(date)}`, 0, 232, { width: W, align: "center" });

    // Divider
    doc.lineWidth(2).strokeColor(accent)
       .moveTo(W/2 - 120, 258).lineTo(W/2 + 120, 258).stroke();
    doc.save().translate(W/2, 258).rotate(45).rect(-4, -4, 8, 8).fill(accent).restore();

    // Headlines box
    const boxX = 50;
    const boxY = 280;
    const boxW = W - 100;
    const boxH = 160;

    doc.roundedRect(boxX, boxY, boxW, boxH, 8).fillAndStroke(card, border);
    doc.roundedRect(boxX, boxY, boxW, 32, 8).fill(accent);
    doc.rect(boxX, boxY + 24, boxW, 8).fill(accent);

    doc.font("Helvetica-Bold").fontSize(11).fillColor(bg)
       .text("TOP HEADLINES", 0, boxY + 9, { width: W, align: "center" });

    let hY = boxY + 45;
    for (let i = 0; i < headlines.length; i++) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor(accent)
         .text(`${i + 1}`, boxX + 15, hY, { continued: false });
      doc.font("Helvetica").fontSize(10).fillColor(white)
         .text(headlines[i], boxX + 35, hY, { width: boxW - 50 });
      hY += 38;
    }

    // Weather
    const pillY = boxY + boxH + 20;
    doc.roundedRect(W/2 - 100, pillY, 200, 28, 14).fillAndStroke(card, border);
    doc.font("Helvetica").fontSize(9).fillColor(muted)
       .text(`${weather.city}: ${weather.temp}, ${weather.condition}`, 0, pillY + 8, { width: W, align: "center" });

    // CTA
    const ctaY = pillY + 45;
    doc.roundedRect(70, ctaY, W - 140, 55, 8).fillAndStroke(card, accent);
    doc.font("Helvetica-Bold").fontSize(12).fillColor(accent)
       .text("TIMESTAMP THIS DOCUMENT", 0, ctaY + 12, { width: W, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(muted)
       .text("Upload to docuproof.io for blockchain-verified proof of this date", 0, ctaY + 32, { width: W, align: "center" });

    // Footer
    const footY = H - 50;
    doc.lineWidth(1).strokeColor(border).moveTo(100, footY).lineTo(W - 100, footY).stroke();
    doc.font("Helvetica").fontSize(7).fillColor(dim)
       .text(`docuProof.io  •  Proof of Existence on the Blockchain  •  ${dateId}-DAILY`, 0, footY + 8, { width: W, align: "center" });

    doc.end();
  });
}

exports.handler = async (event, context) => {
  console.log("Generating daily headline PDF...");
  try {
    const now = new Date();
    const dateStr = formatShortDate(now);
    const [headlines, weather] = await Promise.all([fetchHeadlines(), fetchWeather()]);
    
    const pdfBuffer = await generatePDF(now, headlines, weather);
    console.log(`PDF generated: ${pdfBuffer.length} bytes`);

    const store = getStore({
      name: "daily-headlines",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });

    await store.set("today.pdf", pdfBuffer, { metadata: { date: dateStr } });
    await store.set(`${dateStr}.pdf`, pdfBuffer, { metadata: { date: dateStr } });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, date: dateStr, headlines: headlines.length, size: pdfBuffer.length })
    };
  } catch (err) {
    console.error("Error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
