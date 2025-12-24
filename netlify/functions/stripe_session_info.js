// netlify/functions/stripe_session_info.js
// Purpose: map Stripe Checkout session_id (cs_live_...) -> canonical proof id
// Canonical rule: sha256(session_id).slice(0, 12) (must match stripe_webhook.js)

const crypto = require("crypto");

exports.handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const sessionId = (qs.session_id || qs.id || "").trim();

    if (!sessionId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Missing session_id" }),
      };
    }

    // Validate basic shape (optional but helps avoid garbage input)
    if (!/^cs_(live|test)_/i.test(sessionId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          ok: false,
          error: "Expected a Stripe session id (cs_live_... or cs_test_...)",
        }),
      };
    }

    const canonicalId = crypto
      .createHash("sha256")
      .update(sessionId)
      .digest("hex")
      .slice(0, 12);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id: sessionId,
        canonicalId,
        verifyUrl: `${event.headers["x-forwarded-proto"] || "https"}://${event.headers["x-forwarded-host"] || event.headers.host}/v/${canonicalId}`,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};