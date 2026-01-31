// netlify/functions/generate-daily-headline.js
// Scheduled function that runs daily at 9am EST to generate "Today in History" PDF
// Schedule: 0 14 * * * (9am EST = 2pm UTC)
// 
// BRANDED VERSION - Dark theme matching docuProof.io

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

// Generate the branded PDF
async function generatePDF(date, headlines, weather) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "LETTER",
        autoFirstPage: false, // We'll add the page manually to control it
        margins: { top: inch(0.5), bottom: inch(0.5), left: inch(0.5), right: inch(0.5) },
        info: {
          Title: `Today in History - ${formatDate(date)}`,
          Author: "docuProof.io",
          Subject: "Daily headline document",
          Creator: "docuProof Daily Generator v2.0"
        }
      });

      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Add single page
      doc.addPage();
      
      const pageW = doc.page.width;   // 612
      const pageH = doc.page.height;  // 792

      // === BRAND COLORS ===
      const colors = {
        bgDark: "#0a0d10",
        bgCard: "#12161c",
        bgElevated: "#1a1f27",
        accent: "#22c55e",
        accentDark: "#16a34a",
        accentGlow: "#0f2a1a",
        white: "#ffffff",
        textPrimary: "#e8eaed",
        textMuted: "#8b949e",
        textDim: "#6b7280",
        border: "#21262d",
      };

      // === DARK BACKGROUND ===
      doc.rect(0, 0, pageW, pageH).fill(colors.bgDark);

      // === SUBTLE GLOW AT TOP ===
      for (let i = 20; i > 0; i--) {
        const alpha = 0.02 * (20 - i);
        doc.circle(pageW / 2, pageH - inch(1.5), i * 18)
           .fill(`rgba(34, 197, 94, ${alpha})`);
      }

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

      // === LOGO ===
      let y = pageH - inch(1);
      
      const logoPaths = [
        "./netlify/functions/assets/logo_nobg.png",
        "./netlify/functions/assets/logo.png",
        "./docuproof-logo.png"
      ];
      let logoUsed = null;
      for (const p of logoPaths) {
        if (fs.existsSync(p)) {
          logoUsed = p;
          break;
        }
      }

      if (logoUsed) {
        const logoSize = inch(0.8);
        doc.image(logoUsed, (pageW - logoSize) / 2, y - logoSize, {
          width: logoSize,
          height: logoSize
        });
        y -= logoSize + inch(0.2);
      } else {
        const logoSize = inch(0.6);
        // Fallback: draw text logo with icon
        doc.fontSize(logoSize * 0.6)
           .fillColor(colors.accent)
           .text("📄🔒", 0, y - logoSize, { width: pageW, align: "center" });
        y -= logoSize + inch(0.1);
      }

      // Brand name under logo
      doc.font("Helvetica")
         .fontSize(9)
         .fillColor(colors.textDim)
         .text("docuProof", 0, y, { width: pageW, align: "center" });

      // === DATE ID (top right corner) ===
      const dateId = `#${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      doc.font("Helvetica-Bold")
         .fontSize(10)
         .fillColor(colors.accent)
         .text(dateId, pageW - inch(1.2), pageH - inch(0.65), { width: inch(0.9), align: "right" });

      // === MAIN TITLE ===
      y -= inch(0.6);
      doc.font("Helvetica-Bold")
         .fontSize(28)
         .fillColor(colors.accent)
         .text("docuProof", 0, y, { width: pageW, align: "center" });

      y -= inch(0.35);
      doc.font("Helvetica-Oblique")
         .fontSize(12)
         .fillColor(colors.textMuted)
         .text("Proof you can point to.", 0, y, { width: pageW, align: "center" });

      // === TODAY IN HISTORY ===
      y -= inch(0.7);
      doc.font("Helvetica-Bold")
         .fontSize(36)
         .fillColor(colors.white)
         .text("TODAY IN HISTORY", 0, y, { width: pageW, align: "center" });

      // === DATE ===
      y -= inch(0.55);
      doc.font("Helvetica-Bold")
         .fontSize(26)
         .fillColor(colors.accent)
         .text(formatDate(date), 0, y, { width: pageW, align: "center" });

      // === DECORATIVE DIVIDER ===
      y -= inch(0.5);
      const divW = inch(4);
      doc.lineWidth(2)
         .strokeColor(colors.accent)
         .moveTo((pageW - divW) / 2, y)
         .lineTo((pageW + divW) / 2, y)
         .stroke();

      doc.save()
         .translate(pageW / 2, y)
         .rotate(45)
         .rect(-4, -4, 8, 8)
         .fill(colors.accent)
         .restore();

      // === HEADLINES SECTION ===
      y -= inch(0.6);
      
      // Headlines box
      const boxX = inch(0.8);
      const boxW = pageW - inch(1.6);
      const boxTop = y;
      
      // Draw header bar
      const headerH = inch(0.4);
      doc.roundedRect(boxX, y - headerH, boxW, headerH, 8)
         .fill(colors.accent);
      
      doc.font("Helvetica-Bold")
         .fontSize(11)
         .fillColor(colors.bgDark)
         .text("TOP HEADLINES", boxX, y - headerH + 10, { width: boxW, align: "center" });

      y -= headerH + inch(0.15);

      // Headlines content box
      const contentTop = y;
      const contentH = inch(2.2);
      doc.roundedRect(boxX, y - contentH, boxW, contentH, 8)
         .fill(colors.bgCard);

      y -= inch(0.25);
      
      // Headlines with numbers
      headlines.forEach((headline, i) => {
        const numX = boxX + inch(0.3);
        const textX = boxX + inch(0.6);
        const textW = boxW - inch(0.9);
        
        // Number
        doc.font("Helvetica-Bold")
           .fontSize(16)
           .fillColor(colors.accent)
           .text(`${i + 1}`, numX, y - inch(0.05), { width: inch(0.3) });
        
        // Headline text
        doc.font("Helvetica")
           .fontSize(13)
           .fillColor(colors.textPrimary)
           .text(headline, textX, y, { width: textW, lineGap: 2 });
        
        y -= inch(0.65);
      });

      // === WEATHER ===
      y -= inch(0.3);
      const weatherText = `${weather.city}: ${weather.temp}, ${weather.condition}`;
      
      doc.roundedRect(pageW/2 - inch(1.5), y - inch(0.35), inch(3), inch(0.45), 20)
         .fill(colors.bgElevated);
      
      doc.font("Helvetica")
         .fontSize(11)
         .fillColor(colors.textMuted)
         .text(weatherText, 0, y - inch(0.22), { width: pageW, align: "center" });

      // === CTA BOX ===
      y -= inch(0.7);
      
      doc.lineWidth(2)
         .strokeColor(colors.accent)
         .roundedRect(boxX, y - inch(0.8), boxW, inch(0.8), 12)
         .stroke();
      
      doc.font("Helvetica-Bold")
         .fontSize(14)
         .fillColor(colors.accent)
         .text("TIMESTAMP THIS DOCUMENT", 0, y - inch(0.55), { width: pageW, align: "center" });
      
      doc.font("Helvetica")
         .fontSize(10)
         .fillColor(colors.textMuted)
         .text("Upload to docuproof.io for blockchain-verified proof of this date", 0, y - inch(0.3), { width: pageW, align: "center" });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Main handler - scheduled function
exports.handler = async (event, context) => {
  console.log("=== Daily Headline Generator Starting ===");
  
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
