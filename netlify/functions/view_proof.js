// netlify/functions/view_proof.js
// Redirect /v/<id> → verify_page?id=<id>
// Example: https://docuproof.io/v/cs_test_email004 → verify page

export const handler = async (event) => {
  try {
    const id = event.path.replace(/^\/?v\//, "").trim();
    if (!id) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "text/plain" },
        body: "Missing proof ID in URL path",
      };
    }

    const redirectUrl = `https://docuproof.io/.netlify/functions/verify_page?id=${encodeURIComponent(id)}`;

    return {
      statusCode: 302,
      headers: {
        Location: redirectUrl,
        "Cache-Control": "no-store",
      },
    };
  } catch (e) {
    console.error("view_proof redirect error:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: "Internal error",
    };
  }
};