// netlify/functions/stripe_probe.js
const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

exports.handler = async (event) => {
  const sessionId =
    (event.queryStringParameters?.id ||
      event.queryStringParameters?.session_id ||
      "").trim();

  if (!sessionId) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Missing id/session_id" }),
    };
  }

  try {
    const s = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: true,
        session_id: s.id,
        livemode: !!s.livemode,
        payment_status: s.payment_status || null,
        mode: s.mode || null,
        customer_email: s.customer_email || null,
        metadata: s.metadata || {},
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};