// netlify/functions/generate_daily_headline.js
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

// Format time
function formatTime(date) {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
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
    return { temp: "45°F", condition: "Partly Cloudy", city: "New York" };
  }
  
  try {
    const response = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=New%20York,US&units=imperial&appid=${apiKey}`
    );
    
    if (!response.ok) {
      throw new Error(`OpenWeather error: ${response.status}`);
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
        margins: { top: inch(0.5), bottom: inch(0.5), left: inch(0.5), right: inch(0.5) },
        info: {
          Title: `Today in History - ${formatDate(date)}`,
          Author: "docuProof.io",
          Subject: "Daily timestamp document",
          Creator: "docuProof Daily Generator v2.0"
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
        accentGlow: "#0f2a1a",
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
      doc.moveTo(inch(0.4), inch(0.4) + cornerLen)
         .lineTo(inch(0.4), inch(0.4))
         .lineTo(inch(0.4) + cornerLen, inch(0.4))
         .stroke();
      
      // Top-right
      doc.moveTo(pageW - inch(0.4) - cornerLen, inch(0.4))
         .lineTo(pageW - inch(0.4), inch(0.4))
         .lineTo(pageW - inch(0.4), inch(0.4) + cornerLen)
         .stroke();
      
      // Bottom-left
      doc.moveTo(inch(0.4), pageH - inch(0.4) - cornerLen)
         .lineTo(inch(0.4), pageH - inch(0.4))
         .lineTo(inch(0.4) + cornerLen, pageH - inch(0.4))
         .stroke();
      
      // Bottom-right
      doc.moveTo(pageW - inch(0.4) - cornerLen, pageH - inch(0.4))
         .lineTo(pageW - inch(0.4), pageH - inch(0.4))
         .lineTo(pageW - inch(0.4), pageH - inch(0.4) - cornerLen)
         .stroke();

      // === COLLECTIBLE NUMBER (top right) ===
      const dateId = date.toISOString().split('T')[0].replace(/-/g, '');
      doc.font("Helvetica-Bold")
         .fontSize(10)
         .fillColor(colors.accent)
         .text(`#${dateId}`, pageW - inch(1.3), inch(0.55), { width: inch(0.9), align: "right" });

      // === LOGO AREA (top center) ===
      let y = inch(0.8);
      
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
        const logoSize = inch(0.7);
        doc.image(logoUsed, (pageW - logoSize) / 2, y, {
          width: logoSize,
          height: logoSize
        });
        y += logoSize + inch(0.15);
      } else {
        // Fallback: draw a simple logo placeholder
        const logoSize = inch(0.5);
        doc.roundedRect((pageW - logoSize) / 2, y, logoSize, logoSize, 6)
           .fillAndStroke(colors.bgElevated, colors.accent);
        y += logoSize + inch(0.2);
      }

      // === BRAND NAME ===
      doc.font("Helvetica-Bold")
         .fontSize(18)
         .fillColor(colors.accent)
         .text("docuProof", 0, y, { width: pageW, align: "center" });
      y += inch(0.28);

      doc.font("Helvetica-Oblique")
         .fontSize(9)
         .fillColor(colors.textMuted)
         .text("Proof you can point to.", 0, y, { width: pageW, align: "center" });
      y += inch(0.5);

      // === MAIN TITLE ===
      doc.font("Helvetica-Bold")
         .fontSize(32)
         .fillColor(colors.white)
         .text("TODAY IN HISTORY", 0, y, { width: pageW, align: "center" });
      y += inch(0.5);

      // === DATE ===
      doc.font("Helvetica-Bold")
         .fontSize(22)
         .fillColor(colors.accent)
         .text(formatDate(date), 0, y, { width: pageW, align: "center" });
      y += inch(0.35);

      doc.font("Helvetica")
         .fontSize(10)
         .fillColor(colors.textDim)
         .text(`Generated at ${formatTime(date)}`, 0, y, { width: pageW, align: "center" });
      y += inch(0.4);

      // === DECORATIVE DIVIDER ===
      const divW = inch(3.5);
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
      y += inch(0.45);

      // === HEADLINES BOX ===
      const boxMargin = inch(0.7);
      const boxWidth = pageW - 2 * boxMargin;
      const boxHeight = inch(2.6);

      // Box background
      doc.roundedRect(boxMargin, y, boxWidth, boxHeight, 10)
         .fillAndStroke(colors.bgCard, colors.border);

      // Header bar
      const headerH = inch(0.45);
      doc.save();
      doc.roundedRect(boxMargin, y, boxWidth, headerH, 10).clip();
      doc.rect(boxMargin, y, boxWidth, headerH).fill(colors.accent);
      doc.restore();
      // Fill bottom part of header to make it flat
      doc.rect(boxMargin, y + headerH - 10, boxWidth, 10).fill(colors.accent);

      doc.font("Helvetica-Bold")
         .fontSize(12)
         .fillColor(colors.bgDark)
         .text("TOP HEADLINES", 0, y + inch(0.14), { width: pageW, align: "center" });

      // Headlines
      let hY = y + headerH + inch(0.3);

      for (let i = 0; i < headlines.length; i++) {
        // Number
        doc.font("Helvetica-Bold")
           .fontSize(14)
           .fillColor(colors.accent)
           .text(`${i + 1}`, boxMargin + inch(0.25), hY);

        // Headline text
        doc.font("Helvetica")
           .fontSize(12)
           .fillColor(colors.textPrimary)
           .text(headlines[i], boxMargin + inch(0.55), hY, {
             width: boxWidth - inch(0.8),
             lineGap: 2
           });

        hY = doc.y + inch(0.25);
      }

      y += boxHeight + inch(0.35);

      // === WEATHER PILL ===
      const pillW = inch(3);
      const pillH = inch(0.4);
      const pillX = (pageW - pillW) / 2;

      doc.roundedRect(pillX, y, pillW, pillH, pillH / 2)
         .fillAndStroke(colors.bgElevated, colors.border);

      doc.font("Helvetica")
         .fontSize(10)
         .fillColor(colors.textMuted)
         .text(`${weather.city}: ${weather.temp}, ${weather.condition}`, 0, y + inch(0.12), {
           width: pageW,
           align: "center"
         });
      y += pillH + inch(0.4);

      // === CTA BOX ===
      const ctaMargin = inch(0.9);
      const ctaWidth = pageW - 2 * ctaMargin;
      const ctaHeight = inch(0.8);

      // Glow effect
      doc.roundedRect(ctaMargin - 3, y - 3, ctaWidth + 6, ctaHeight + 6, 12)
         .fill(colors.accentGlow);

      // CTA box
      doc.roundedRect(ctaMargin, y, ctaWidth, ctaHeight, 10)
         .fillAndStroke(colors.bgCard, colors.accent);

      doc.font("Helvetica-Bold")
         .fontSize(13)
         .fillColor(colors.accent)
         .text("TIMESTAMP THIS DOCUMENT", 0, y + inch(0.18), { width: pageW, align: "center" });

      doc.font("Helvetica")
         .fontSize(10)
         .fillColor(colors.textMuted)
         .text("Upload to docuproof.io for blockchain-verified proof of this date", 0, y + inch(0.45), {
           width: pageW,
           align: "center"
         });

      // === FOOTER ===
      const footerY = pageH - inch(0.85);

      doc.lineWidth(1)
         .strokeColor(colors.border)
         .moveTo(inch(1.5), footerY)
         .lineTo(pageW - inch(1.5), footerY)
         .stroke();

      doc.font("Helvetica")
         .fontSize(9)
         .fillColor(colors.textDim)
         .text("docuProof.io  •  Proof of Existence on the Blockchain", 0, footerY + inch(0.15), {
           width: pageW,
           align: "center"
         });

      doc.font("Helvetica")
         .fontSize(8)
         .fillColor(colors.textDim)
         .text(`Document ID: ${dateId}-DAILY  •  ${date.toISOString()}`, 0, footerY + inch(0.35), {
           width: pageW,
           align: "center"
         });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Main handler
exports.handler = async (event, context) => {
  console.log("Starting daily headline PDF generation...");

  try {
    const now = new Date();
    const dateStr = formatShortDate(now);

    console.log(`Generating PDF for ${dateStr}...`);

    const [headlines, weather] = await Promise.all([
      fetchHeadlines(),
      fetchWeather()
    ]);

    console.log("Headlines:", headlines);
    console.log("Weather:", weather);

    const pdfBuffer = await generatePDF(now, headlines, weather);
    console.log(`PDF generated: ${pdfBuffer.length} bytes`);

    const store = getStore({
      name: "daily-headlines",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });

    await store.set("today.pdf", pdfBuffer, { 
      metadata: { date: dateStr, generatedAt: now.toISOString() }
    });
    console.log("Saved as today.pdf");

    await store.set(`${dateStr}.pdf`, pdfBuffer, {
      metadata: { date: dateStr, generatedAt: now.toISOString() }
    });
    console.log(`Saved as ${dateStr}.pdf`);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, date: dateStr, headlines: headlines.length, size: pdfBuffer.length })
    };

  } catch (err) {
    console.error("Error generating daily PDF:", err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};
