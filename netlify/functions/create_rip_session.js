// netlify/functions/create_rip_session.js
// v2.0.0 - Creates a Stripe Checkout session for the RIP (Redundant Identity Preservation) upsell
// Called from success.html "Yes, Protect My Proof →" button
// Expects: ?id=PROOF_ID (query string)
// Fixed: success_url now returns to success.html (not verify page)
// Fixed: Pre-fills customer email from email-prospects store

const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

async function lookupEmail(proofId) {
  try {
    const mod = await import("@netlify/blobs");
    const gs = mod.getStore || (mod.default && mod.default.getStore);
    let store;
    try {
      store = gs("email-prospects");
    } catch {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
      store = gs({ name: "email-prospects", siteID, token });
    }
    const raw = await store.get(`proof:${proofId}`, { type: "text" });
    if (raw) {
      const record = JSON.parse(raw);
      if (record.email) return record.email;
    }
  } catch (e) {
    console.log("create_rip_session: email lookup failed:", e.message);
  }
  return null;
}

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

    // Success URL goes back to success.html with rip_paid flag
    const successUrl = `${origin}/success.html?id=${encodeURIComponent(proofId)}&rip_paid=true`;
    const cancelUrl = `${origin}/success.html?id=${encodeURIComponent(proofId)}`;

    // RIP price — $2.00 for redundant storage preservation
    // Stripe Price: price_1Sr0CzIn2dWVc65RNAAuefwL (product: prod_TodTY3ku5nQUOx)
    const ripPriceId = process.env.STRIPE_RIP_PRICE_ID || "price_1Sr0CzIn2dWVc65RNAAuefwL";

    const sessionConfig = {
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        proofId,
        product: "rip",
        source: "rip_upsell",
      },
      line_items: [{ price: ripPriceId, quantity: 1 }],
    };

    // Pre-fill customer email if we can find it
    const email = await lookupEmail(proofId);
    if (email) {
      sessionConfig.customer_email = email;
    }

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
