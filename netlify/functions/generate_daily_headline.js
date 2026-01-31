// netlify/functions/generate_daily_headline.js
// v4.1.0 - FIXED: Single page, correct Y coordinates, fixed Blobs import
// Scheduled function that runs daily at 9am EST to generate "Today in History" PDF

const fs = require("fs");
const PDFDocument = require("pdfkit");

// Convert inches to points
function inch(n) { return n * 72; }

// Get Netlify Blobs store safely
async function getStoreSafe(storeName) {
  try {
    const mod = await import("@netlify/blobs");
    
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || null;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || null;
    
    if (siteID && token) {
      return mod.getStore({ name: storeName, siteID, token });
    }
    
    // Try without explicit credentials (works in Netlify runtime)
    return mod.getStore(storeName);
  } catch (err) {
    console.error("Failed to get blob store:", err);
    return null;
  }
}

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

// Generate the branded PDF - SINGLE PAGE, TOP-DOWN layout
async function generatePDF(date, headlines, weather) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        margin: inch(0.5),
        info: {
          Title: `Today in History - ${formatDate(date)}`,
          Author: "docuProof.io",
          Subject: "Daily headline document for blockchain timestamping",
          Creator: "docuProof Daily Generator v4.0"
        }
      });

      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      
      const pageW = 612;  // LETTER width
      const pageH = 792;  // LETTER height

      // === BRAND COLORS ===
      const colors = {
        bgDark: "#0a0d10",
        bgCard: "#12161c",
        bgElevated: "#1a1f27",
        accent: "#22c55e",
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
      const inset = inch(0.4);
      doc.lineWidth(2).strokeColor(colors.accent);
      
      // Top-left corner
      doc.moveTo(inset, inset + cornerLen)
         .lineTo(inset, inset)
         .lineTo(inset + cornerLen, inset)
         .stroke();
      
      // Top-right corner
      doc.moveTo(pageW - inset - cornerLen, inset)
         .lineTo(pageW - inset, inset)
         .lineTo(pageW - inset, inset + cornerLen)
         .stroke();
      
      // Bottom-left corner
      doc.moveTo(inset, pageH - inset - cornerLen)
         .lineTo(inset, pageH - inset)
         .lineTo(inset + cornerLen, pageH - inset)
         .stroke();
      
      // Bottom-right corner
      doc.moveTo(pageW - inset - cornerLen, pageH - inset)
         .lineTo(pageW - inset, pageH - inset)
         .lineTo(pageW - inset, pageH - inset - cornerLen)
         .stroke();

      // === DATE ID (top right) ===
      const dateId = `#${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      doc.font("Helvetica-Bold")
         .fontSize(10)
         .fillColor(colors.accent)
         .text(dateId, pageW - inch(1.3), inch(0.6), { width: inch(1), align: "right" });

      // === CONTENT - TOP DOWN ===
      let y = inch(0.9);

      // docuProof branding
      doc.font("Helvetica-Bold")
         .fontSize(28)
         .fillColor(colors.accent)
         .text("docuProof", 0, y, { width: pageW, align: "center" });
      y += inch(0.4);

      doc.font("Helvetica-Oblique")
         .fontSize(11)
         .fillColor(colors.textMuted)
         .text("Proof you can point to.", 0, y, { width: pageW, align: "center" });
      y += inch(0.6);

      // === MAIN DATE ===
      doc.font("Helvetica-Bold")
         .fontSize(32)
         .fillColor(colors.accent)
         .text(formatDate(date), 0, y, { width: pageW, align: "center" });
      y += inch(0.6);

      // === DECORATIVE DIVIDER ===
      const divW = inch(3);
      const divX = (pageW - divW) / 2;
      doc.lineWidth(2)
         .strokeColor(colors.accent)
         .moveTo(divX, y)
         .lineTo(divX + divW, y)
         .stroke();

      // Diamond in center
      doc.save()
         .translate(pageW / 2, y)
         .rotate(45)
         .rect(-4, -4, 8, 8)
         .fill(colors.accent)
         .restore();
      y += inch(0.5);

      // === WEATHER PILL ===
      const weatherText = `${weather.city}: ${weather.temp}, ${weather.condition}`;
      const pillW = inch(2.8);
      const pillH = inch(0.4);
      const pillX = (pageW - pillW) / 2;
      
      doc.roundedRect(pillX, y, pillW, pillH, 20)
         .fill(colors.bgElevated);
      
      doc.font("Helvetica")
         .fontSize(11)
         .fillColor(colors.textMuted)
         .text(weatherText, 0, y + 10, { width: pageW, align: "center" });
      y += inch(0.7);

      // === HEADLINES BOX ===
      const boxX = inch(0.8);
      const boxW = pageW - inch(1.6);
      const boxH = inch(2.4);
      
      // Dark card background
      doc.roundedRect(boxX, y, boxW, boxH, 8)
         .fill(colors.bgCard);

      // Headlines content
      let headlineY = y + inch(0.4);
      
      headlines.forEach((headline, i) => {
        // Number
        doc.font("Helvetica-Bold")
           .fontSize(16)
           .fillColor(colors.accent)
           .text(`${i + 1}`, boxX + inch(0.3), headlineY);
        
        // Headline text
        const truncated = headline.length > 85 ? headline.slice(0, 82) + "..." : headline;
        doc.font("Helvetica")
           .fontSize(13)
           .fillColor(colors.textPrimary)
           .text(truncated, boxX + inch(0.65), headlineY, { width: boxW - inch(1.0) });
        
        headlineY += inch(0.6);
      });

      // "TOP HEADLINES" bar at bottom of box
      const barH = inch(0.38);
      const barY = y + boxH - barH;
      doc.roundedRect(boxX, barY, boxW, barH, 8)
         .fill(colors.accent);
      
      doc.font("Helvetica-Bold")
         .fontSize(10)
         .fillColor(colors.bgDark)
         .text("TOP HEADLINES", boxX, barY + 11, { width: boxW, align: "center" });

      y += boxH + inch(0.5);

      // === CTA BOX ===
      const ctaH = inch(0.75);
      doc.lineWidth(2)
         .strokeColor(colors.accent)
         .roundedRect(boxX, y, boxW, ctaH, 12)
         .stroke();
      
      doc.font("Helvetica-Bold")
         .fontSize(14)
         .fillColor(colors.accent)
         .text("TIMESTAMP THIS DOCUMENT", 0, y + inch(0.18), { width: pageW, align: "center" });
      
      doc.font("Helvetica")
         .fontSize(10)
         .fillColor(colors.textMuted)
         .text("Upload to docuproof.io for blockchain-verified proof of this date", 0, y + inch(0.45), { width: pageW, align: "center" });

      // === FOOTER ===
      doc.font("Helvetica")
         .fontSize(8)
         .fillColor(colors.textDim)
         .text("docuProof.io • Proof of Existence on the Blockchain", 0, pageH - inch(0.6), { width: pageW, align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Main handler - scheduled function
exports.handler = async (event, context) => {
  console.log("=== Daily Headline Generator v4.0 Starting ===");
  
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
    const store = await getStoreSafe("daily-headlines");
    
    if (!store) {
      console.error("Could not connect to blob store");
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: "Blob store unavailable" })
      };
    }
    
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
