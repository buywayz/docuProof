// netlify/functions/stripe_session_info.js
// Purpose: map Stripe Checkout session_id (cs_live_...) -> canonical proof id
// Canonical rule: sha256(session_id).slice(0, 12) (must match stripe_webhook.js)
// v2: also returns amountTotal / currency / paymentStatus / mode so success.html can
//     report real paid purchases to Google Ads (free promo checkouts are not reported).

const crypto = require("crypto");
const Stripe = require("stripe");

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

    // Purchase details for conversion tracking (best-effort; never blocks the page)
    let amountTotal = null, currency = null, paymentStatus = null, mode = null;
    try {
      if (process.env.STRIPE_SECRET_KEY) {
        const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
        const s = await stripe.checkout.sessions.retrieve(sessionId);
        amountTotal = typeof s.amount_total === "number" ? s.amount_total : null; // cents
        currency = s.currency || null;
        paymentStatus = s.payment_status || null; // "paid" | "no_payment_required" | "unpaid"
        mode = s.mode || null;                    // "payment" | "subscription"
      }
    } catch (stripeErr) {
      console.error("stripe_session_info: Stripe lookup failed (non-fatal):", stripeErr.message);
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id: sessionId,
        canonicalId,
        amountTotal,
        currency,
        paymentStatus,
        mode,
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