// netlify/functions/logo_static.js
// Serves the docuProof logo PNG from functions/assets

const fs = require("fs");
const path = require("path");

exports.handler = async () => {
  try {
    const filePath = path.join(__dirname, "assets", "logo_nobg.png");
    const file = fs.readFileSync(filePath);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "image/png",
        // Long-lived cache; logo rarely changes
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: file.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    console.error("logo_static error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: "Unable to load logo",
    };
  }
};