// netlify/functions/generate_daily_headline.js
// v3.0.0 - Fixed single page rendering, dark theme
// Scheduled function that runs daily at 9am EST to generate "Today in History" PDF
// Schedule: 0 14 * * * (9am EST = 2pm UTC)

const fs = require("fs");
const PDFDocument = require("pdfkit");
const { getStore } = require("@netlify/blobs");

// Convert inches to points
function inch(n) { return n * 72; }

// Format date nicely
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Format short date for filename
function formatShortDate(date) {
  return date.toISOString().split('T')[0];
}

// Fetch top headlines from NewsAPI
async function fetchHeadlines() {
  const apiKey = process.env.NEWSAPI_KEY;
  
  if (!apiKey) {
    console.warn("NEWSAPI_KEY not set, using placeholder headlines");
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
    
    if (!response.ok) {
      throw new Error(`NewsAPI error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.articles && data.articles.length > 0) {
      return data.articles
        .slice(0, 3)
        .map(article => article.title)
        .map(title => {
          // Remove source suffix like " - CNN" or " | Reuters"
          return title.replace(/\s*[-|]\s*[^-|]+$/, '').trim();
        });
    }
    
    throw new Error("No articles returned");
  } catch (err) {
    console.error("Error fetching headlines:", err);
    return [
      "Check docuproof.io for today's headlines",
      "News headlines temporarily unavailable",
      "Timestamp any document to prove it existed today"
    ];
  }
}

// Fetch weather for New York
async function fetchWeather() {
  const apiKey = process.env.OPENWEATHER_KEY;
  
  if (!apiKey) {
    console.warn("OPENWEATHER_KEY not set, using placeholder weather");
    return { temp: "--°F", condition: "Check weather", city: "New York" };
  }
  
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=New%20York,US&units=imperial&appid=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      temp: `${Math.round(data.main.temp)}°F`,
      condition: data.weather[0]?.main || "Unknown",
      city: "New York"
    };
  } catch (err) {
    console.error("Error fetching weather:", err);
    return { temp: "--°F", condition: "Unavailable", city: "New York" };
  }
}

// Generate the branded PDF - SINGLE PAGE
async function generatePDF(date, headlines, weather) {
  return new Promise((resolve, reject) => {
    try {
      // Create document with single page (autoFirstPage: true is default)
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: inch(0.5), bottom: inch(0.5), left: inch(0.5), right: inch(0.5) },
        bufferPages: true, // Buffer pages to prevent auto page breaks
        info: {
          Title: `Today in History - ${formatDate(date)}`,
          Author: "docuProof.io",
          Subject: "Daily headline document for blockchain timestamping",
          Creator: "docuProof Daily Generator v3.0"
        }
      });

      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      
      const pageW = doc.page.width;   // 612
      const pageH = doc.page.height;  // 792

      // === BRAND COLORS ===
      const colors = {
        bgDark: "#0a0d10",
        bgCard: "#12161c",
        bgElevated: "#1a1f27",
        accent: "#22c55e",
        accentDark: "#16a34a",
        white: "#ffffff",
        textPrimary: "#e8eaed",
        textMuted: "#8b949e",
        textDim: "#6b7280",
        border: "#21262d",
      };

      // === DARK BACKGROUND ===
      doc.rect(0, 0, pageW, pageH).fill(colors.bgDark);

      // === BORDER FRAME ===
      doc.lineWidth(1)
         .strokeColor(colors.border)
         .roundedRect(inch(0.4), inch(0.4), pageW - inch(0.8), pageH - inch(0.8), 12)
         .stroke();

      // === ACCENT CORNERS ===
      const cornerLen = inch(0.4);
      doc.lineWidth(2).strokeColor(colors.accent);
      
      // Top-left
      doc.moveTo(inch(0.4), pageH - inch(0.4) - cornerLen)
         .lineTo(inch(0.4), pageH - inch(0.4))
         .lineTo(inch(0.4) + cornerLen, pageH - inch(0.4))
         .stroke();
      
      // Top-right
      doc.moveTo(pageW - inch(0.4) - cornerLen, pageH - inch(0.4))
         .lineTo(pageW - inch(0.4), pageH - inch(0.4))
         .lineTo(pageW - inch(0.4), pageH - inch(0.4) - cornerLen)
         .stroke();
      
      // Bottom-left
      doc.moveTo(inch(0.4), inch(0.4) + cornerLen)
         .lineTo(inch(0.4), inch(0.4))
         .lineTo(inch(0.4) + cornerLen, inch(0.4))
         .stroke();
      
      // Bottom-right
      doc.moveTo(pageW - inch(0.4) - cornerLen, inch(0.4))
         .lineTo(pageW - inch(0.4), inch(0.4))
         .lineTo(pageW - inch(0.4), inch(0.4) + cornerLen)
         .stroke();

      // === DATE ID (top right corner) ===
      const dateId = `#${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      doc.font("Helvetica-Bold")
         .fontSize(10)
         .fillColor(colors.accent)
         .text(dateId, pageW - inch(1.2), pageH - inch(0.65), { width: inch(0.9), align: "right" });

      // === CONTENT AREA (top to bottom) ===
      let y = pageH - inch(1.2);

      // docuProof branding at top
      doc.font("Helvetica-Bold")
         .fontSize(28)
         .fillColor(colors.accent)
         .text("docuProof", 0, y, { width: pageW, align: "center" });

      y -= inch(0.35);
      doc.font("Helvetica-Oblique")
         .fontSize(11)
         .fillColor(colors.textMuted)
         .text("Proof you can point to.", 0, y, { width: pageW, align: "center" });

      // === MAIN DATE ===
      y -= inch(0.8);
      doc.font("Helvetica-Bold")
         .fontSize(32)
         .fillColor(colors.accent)
         .text(formatDate(date), 0, y, { width: pageW, align: "center" });

      // === DECORATIVE DIVIDER ===
      y -= inch(0.5);
      const divW = inch(3);
      doc.lineWidth(2)
         .strokeColor(colors.accent)
         .moveTo((pageW - divW) / 2, y)
         .lineTo((pageW + divW) / 2, y)
         .stroke();

      // Diamond in center
      doc.save()
         .translate(pageW / 2, y)
         .rotate(45)
         .rect(-4, -4, 8, 8)
         .fill(colors.accent)
         .restore();

      // === HEADLINES SECTION ===
      y -= inch(0.6);
      
      const boxX = inch(0.8);
      const boxW = pageW - inch(1.6);
      
      // Headlines content box (dark card)
      const contentH = inch(2.0);
      doc.roundedRect(boxX, y - contentH, boxW, contentH, 8)
         .fill(colors.bgCard);

      // Headlines
      let headlineY = y - inch(0.35);
      
      headlines.forEach((headline, i) => {
        const numX = boxX + inch(0.3);
        const textX = boxX + inch(0.65);
        const textW = boxW - inch(1.0);
        
        // Number
        doc.font("Helvetica-Bold")
           .fontSize(16)
           .fillColor(colors.accent)
           .text(`${i + 1}`, numX, headlineY);
        
        // Headline text (truncate if too long)
        const truncatedHeadline = headline.length > 90 ? headline.slice(0, 87) + "..." : headline;
        doc.font("Helvetica")
           .fontSize(12)
           .fillColor(colors.textPrimary)
           .text(truncatedHeadline, textX, headlineY, { width: textW });
        
        headlineY -= inch(0.55);
      });

      // Header bar at bottom of headlines box
      y -= contentH;
      const headerH = inch(0.38);
      doc.roundedRect(boxX, y - headerH, boxW, headerH, 8)
         .fill(colors.accent);
      
      doc.font("Helvetica-Bold")
         .fontSize(10)
         .fillColor(colors.bgDark)
         .text("TOP HEADLINES", boxX, y - headerH + 11, { width: boxW, align: "center" });

      // === WEATHER ===
      y -= headerH + inch(0.5);
      const weatherText = `${weather.city}: ${weather.temp}, ${weather.condition}`;
      
      doc.roundedRect(pageW/2 - inch(1.4), y - inch(0.32), inch(2.8), inch(0.42), 20)
         .fill(colors.bgElevated);
      
      doc.font("Helvetica")
         .fontSize(11)
         .fillColor(colors.textMuted)
         .text(weatherText, 0, y - inch(0.18), { width: pageW, align: "center" });

      // === CTA BOX ===
      y -= inch(0.8);
      
      doc.lineWidth(2)
         .strokeColor(colors.accent)
         .roundedRect(boxX, y - inch(0.75), boxW, inch(0.75), 12)
         .stroke();
      
      doc.font("Helvetica-Bold")
         .fontSize(14)
         .fillColor(colors.accent)
         .text("TIMESTAMP THIS DOCUMENT", 0, y - inch(0.52), { width: pageW, align: "center" });
      
      doc.font("Helvetica")
         .fontSize(10)
         .fillColor(colors.textMuted)
         .text("Upload to docuproof.io for blockchain-verified proof of this date", 0, y - inch(0.28), { width: pageW, align: "center" });

      // === FOOTER ===
      doc.font("Helvetica")
         .fontSize(8)
         .fillColor(colors.textDim)
         .text("docuProof.io • Proof of Existence on the Blockchain", 0, inch(0.6), { width: pageW, align: "center" });

      // Finalize - ensure only one page
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Main handler - scheduled function
exports.handler = async (event, context) => {
  console.log("=== Daily Headline Generator v3.0 Starting ===");
  
  try {
    const now = new Date();
    console.log(`Current time: ${now.toISOString()}`);
    
    // Fetch data in parallel
    const [headlines, weather] = await Promise.all([
      fetchHeadlines(),
      fetchWeather()
    ]);
    
    console.log("Headlines fetched:", headlines);
    console.log("Weather fetched:", weather);
    
    // Generate PDF
    const pdfBuffer = await generatePDF(now, headlines, weather);
    console.log(`PDF generated: ${pdfBuffer.length} bytes`);
    
    // Store in Netlify Blobs
    const store = getStore({
      name: "daily-headlines",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });
    
    // Save as today.pdf (always overwrites)
    await store.set("today.pdf", pdfBuffer);
    console.log("Saved as today.pdf");
    
    // Also save with date-specific name for archival
    const dateKey = `${formatShortDate(now)}.pdf`;
    await store.set(dateKey, pdfBuffer);
    console.log(`Saved as ${dateKey}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        message: "Daily headline PDF generated",
        date: formatShortDate(now),
        headlines: headlines.length,
        size: pdfBuffer.length
      })
    };
    
  } catch (err) {
    console.error("Error generating daily headline:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
