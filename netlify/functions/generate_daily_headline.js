// netlify/functions/generate_daily_headline.js
// v4.2.0 - Debug version with extensive error logging

const PDFDocument = require("pdfkit");

function inch(n) { return n * 72; }

function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

function formatShortDate(date) {
  return date.toISOString().split('T')[0];
}

async function fetchHeadlines() {
  const apiKey = process.env.NEWSAPI_KEY;
  if (!apiKey) {
    return ["Breaking: Major developments today", "Technology sector shifts", "World leaders gather"];
  }
  try {
    const response = await fetch(`https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=${apiKey}`);
    if (!response.ok) throw new Error(`NewsAPI: ${response.status}`);
    const data = await response.json();
    if (data.articles?.length > 0) {
      return data.articles.slice(0, 3).map(a => a.title.replace(/\s*[-|]\s*[^-|]+$/, '').trim());
    }
    throw new Error("No articles");
  } catch (err) {
    console.error("Headlines error:", err);
    return ["Headlines temporarily unavailable", "Check docuproof.io", "Timestamp any document"];
  }
}

async function fetchWeather() {
  const apiKey = process.env.OPENWEATHER_KEY;
  if (!apiKey) return { temp: "--°F", condition: "N/A", city: "New York" };
  try {
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=New%20York,US&units=imperial&appid=${apiKey}`);
    if (!response.ok) throw new Error(`Weather: ${response.status}`);
    const data = await response.json();
    return { temp: `${Math.round(data.main.temp)}°F`, condition: data.weather[0]?.main || "Unknown", city: "New York" };
  } catch (err) {
    console.error("Weather error:", err);
    return { temp: "--°F", condition: "Unavailable", city: "New York" };
  }
}

function generatePDF(date, headlines, weather) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "LETTER", margin: 36 });
      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = 612, pageH = 792;
      const bgDark = "#0a0d10", accent = "#22c55e", textPrimary = "#e8eaed";
      const textMuted = "#8b949e", textDim = "#6b7280", bgCard = "#12161c", border = "#21262d";

      doc.rect(0, 0, pageW, pageH).fill(bgDark);
      doc.lineWidth(1).strokeColor(border).roundedRect(28, 28, pageW - 56, pageH - 56, 12).stroke();

      const c = 28, len = 28;
      doc.lineWidth(2).strokeColor(accent);
      doc.moveTo(c, c + len).lineTo(c, c).lineTo(c + len, c).stroke();
      doc.moveTo(pageW - c - len, c).lineTo(pageW - c, c).lineTo(pageW - c, c + len).stroke();
      doc.moveTo(c, pageH - c - len).lineTo(c, pageH - c).lineTo(c + len, pageH - c).stroke();
      doc.moveTo(pageW - c - len, pageH - c).lineTo(pageW - c, pageH - c).lineTo(pageW - c, pageH - c - len).stroke();

      const dateId = `#${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      doc.font("Helvetica-Bold").fontSize(10).fillColor(accent).text(dateId, pageW - 100, 45, { width: 70, align: "right" });

      let y = 65;
      doc.font("Helvetica-Bold").fontSize(28).fillColor(accent).text("docuProof", 0, y, { width: pageW, align: "center" });
      y += 35;
      doc.font("Helvetica-Oblique").fontSize(11).fillColor(textMuted).text("Proof you can point to.", 0, y, { width: pageW, align: "center" });
      y += 45;
      doc.font("Helvetica-Bold").fontSize(30).fillColor(accent).text(formatDate(date), 0, y, { width: pageW, align: "center" });
      y += 50;

      const dw = 200;
      doc.lineWidth(2).strokeColor(accent).moveTo((pageW - dw) / 2, y).lineTo((pageW + dw) / 2, y).stroke();
      doc.save().translate(pageW / 2, y).rotate(45).rect(-4, -4, 8, 8).fill(accent).restore();
      y += 35;

      const weatherTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
      const weatherText = `${weather.city}: ${weather.temp}, ${weather.condition} at ${weatherTime} EST`;
      doc.roundedRect((pageW - 280) / 2, y, 280, 30, 15).fill("#1a1f27");
      doc.font("Helvetica").fontSize(10).fillColor(textMuted).text(weatherText, 0, y + 9, { width: pageW, align: "center" });
      y += 55;

      const boxX = 58, boxW = pageW - 116, boxH = 175;
      doc.roundedRect(boxX, y, boxW, boxH, 8).fill(bgCard);

      let hy = y + 25;
      headlines.forEach((headline, i) => {
        doc.font("Helvetica-Bold").fontSize(16).fillColor(accent).text(`${i + 1}`, boxX + 20, hy);
        const truncated = headline.length > 80 ? headline.slice(0, 77) + "..." : headline;
        doc.font("Helvetica").fontSize(13).fillColor(textPrimary).text(truncated, boxX + 45, hy, { width: boxW - 65 });
        hy += 45;
      });

      doc.roundedRect(boxX, y + boxH - 28, boxW, 28, 8).fill(accent);
      doc.font("Helvetica-Bold").fontSize(10).fillColor(bgDark).text("TOP HEADLINES", boxX, y + boxH - 20, { width: boxW, align: "center" });
      y += boxH + 35;

      doc.lineWidth(2).strokeColor(accent).roundedRect(boxX, y, boxW, 55, 12).stroke();
      doc.font("Helvetica-Bold").fontSize(14).fillColor(accent).text("TIMESTAMP THIS DOCUMENT", 0, y + 12, { width: pageW, align: "center" });
      doc.font("Helvetica").fontSize(10).fillColor(textMuted).text("Upload to docuproof.io for blockchain-verified proof of this date", 0, y + 32, { width: pageW, align: "center" });

      doc.font("Helvetica").fontSize(8).fillColor(textDim).text("docuProof.io • Proof of Existence on the Blockchain", 0, pageH - 55, { width: pageW, align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

exports.handler = async (event, context) => {
  console.log("=== Daily Headline v4.3 ===");
  try {
    // Use EST/EDT timezone for date display (since headlines are US-based)
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const [headlines, weather] = await Promise.all([fetchHeadlines(), fetchWeather()]);
    console.log("Data fetched");
    
    const pdfBuffer = await generatePDF(now, headlines, weather);
    console.log(`PDF: ${pdfBuffer.length} bytes`);
    
    let store = null;
    try {
      const mod = await import("@netlify/blobs");
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
      if (siteID && token) {
        store = mod.getStore({ name: "daily-headlines", siteID, token });
      } else {
        store = mod.getStore("daily-headlines");
      }
    } catch (e) { console.error("Blobs error:", e); }
    
    if (store) {
      await store.set("today.pdf", pdfBuffer);
      await store.set(`${formatShortDate(now)}.pdf`, pdfBuffer);
      console.log("Saved");
    }
    
    return { statusCode: 200, body: JSON.stringify({ ok: true, size: pdfBuffer.length }) };
  } catch (err) {
    console.error("Error:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message, stack: err.stack }) };
  }
};
