// netlify/functions/create_rip_session.js
// v1.0.0 - Creates a Stripe Checkout session for the RIP (Redundant Identity Preservation) upsell
// Called from the verify page "Yes, Protect My Proof →" button
// Expects: ?id=PROOF_ID (query string)

const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    // Accept proof ID from query string (GET) or body (POST)
    let proofId = null;

    const qp = event.queryStringParameters || {};
    if (qp.id) {
      proofId = qp.id.trim();
    }

    if (!proofId && event.httpMethod === "POST") {
      try {
        const body = JSON.parse(event.body || "{}");
        proofId = (body.id || body.proofId || "").trim();
      } catch {}
    }

    if (!proofId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: "Missing proof ID. Please provide ?id=YOUR_PROOF_ID" }),
      };
    }

    const origin = (process.env.URL || "https://docuproof.io").replace(/\/$/, "");
    const verifyUrl = `${origin}/v/${proofId}`;

    // RIP price — $2.00 for redundant storage preservation
    // Stripe Price: price_1Sr0CzIn2dWVc65RNAAuefwL (product: prod_TodTY3ku5nQUOx)
    const ripPriceId = process.env.STRIPE_RIP_PRICE_ID || "price_1Sr0CzIn2dWVc65RNAAuefwL";

    const sessionConfig = {
      mode: "payment",
      success_url: `${verifyUrl}?rip=success`,
      cancel_url: `${verifyUrl}?rip=cancelled`,
      metadata: {
        proofId,
        product: "rip",
        source: "rip_upsell",
      },
      line_items: [{ price: ripPriceId, quantity: 1 }],
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // Redirect to Stripe Checkout
    return {
      statusCode: 303,
      headers: {
        Location: session.url,
        "Cache-Control": "no-store",
      },
    };
  } catch (err) {
    console.error("create_rip_session error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
