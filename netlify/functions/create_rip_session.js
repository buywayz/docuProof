// netlify/functions/create_rip_session.js
// v3.0.0 - Creates a Stripe Checkout session for the RIP (Redundant Identity Preservation) upsell
// Called from success.html "Yes, Protect My Proof →" button
// Expects: ?id=PROOF_ID (query string)
// v3.0.0: If proof already has ripPurchased=true (Pro plan), skip Stripe and redirect directly
// v3.0.0: If ?check=true, return JSON with plan/RIP status instead of redirecting (for UI updates)

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

async function lookupProof(proofId) {
  try {
    const mod = await import("@netlify/blobs");
    const gs = mod.getStore || (mod.default && mod.default.getStore);
    let store;
    try {
      store = gs("proofs");
    } catch {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
      store = gs({ name: "proofs", siteID, token });
    }
    const raw = await store.get(`proof:${proofId}`, { type: "text" });
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.log("create_rip_session: proof lookup failed:", e.message);
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

    // --- Check if proof already has RIP (Pro plan auto-activated) ---
    const proof = await lookupProof(proofId);
    const isProPlan = proof && proof.plan && proof.plan.startsWith("pro_");
    const ripAlreadyActive = proof && proof.ripPurchased === true;

    // --- ?check=true mode: return JSON for frontend UI updates ---
    if (qp.check === "true") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          proofId,
          plan: proof?.plan || null,
          isProPlan: !!isProPlan,
          ripPurchased: !!ripAlreadyActive,
          ripSource: proof?.ripSource || null,
        }),
      };
    }

    // --- If RIP already active (Pro plan), skip Stripe and redirect directly ---
    if (ripAlreadyActive) {
      console.log(`[create_rip_session] RIP already active for ${proofId} (plan: ${proof?.plan}, source: ${proof?.ripSource}) — skipping Stripe`);
      const successUrl = `${origin}/success.html?id=${encodeURIComponent(proofId)}&rip_paid=true`;
      return {
        statusCode: 303,
        headers: {
          Location: successUrl,
          "Cache-Control": "no-store",
        },
      };
    }

    // --- Normal flow: create Stripe checkout for $2.00 RIP ---
    const successUrl = `${origin}/success.html?id=${encodeURIComponent(proofId)}&rip_paid=true`;
    const cancelUrl = `${origin}/success.html?id=${encodeURIComponent(proofId)}`;

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
