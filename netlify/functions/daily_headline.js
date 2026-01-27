// netlify/functions/daily_headline.js
// Serves the latest daily headline PDF for download

const { getStore } = require("@netlify/blobs");

exports.handler = async (event, context) => {
  try {
    const store = getStore({
      name: "daily-headlines",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });

    // Get the requested date or default to today
    const qp = event.queryStringParameters || {};
    const requestedDate = qp.date; // Optional: ?date=2026-01-27
    
    const key = requestedDate ? `${requestedDate}.pdf` : "today.pdf";
    
    console.log(`Fetching daily headline PDF: ${key}`);

    // Try to get the PDF
    const pdfBlob = await store.get(key, { type: "arrayBuffer" });

    if (!pdfBlob) {
      console.log("No PDF found, returning 404");
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Today's headline PDF hasn't been generated yet. Check back after 9am EST.",
          hint: "The PDF is generated daily at 9am Eastern Time."
        })
      };
    }

    const pdfBuffer = Buffer.from(pdfBlob);
    const today = new Date().toISOString().split('T')[0];
    const filename = requestedDate 
      ? `docuproof-today-${requestedDate}.pdf`
      : `docuproof-today-${today}.pdf`;

    console.log(`Serving PDF: ${filename} (${pdfBuffer.length} bytes)`);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-Generated-By": "docuProof Daily Headlines"
      },
      body: pdfBuffer.toString("base64"),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error("Error serving daily headline PDF:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message })
    };
  }
};
