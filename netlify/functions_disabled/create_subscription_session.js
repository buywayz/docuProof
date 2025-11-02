// netlify/functions/create_subscription_session.js
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const {
      email,
      hash,
      filename,
      displayName,
      priceId = process.env.STRIPE_SUBSCRIPTION_PRICE_ID, // recurring price
    } = JSON.parse(event.body || "{}");

    const origin = "https://docuproof.io";
    const successUrl = `${origin}/success.html`;
    const cancelUrl  = `${origin}/index.html`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      ...(email ? { customer_email: email } : {}),
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        hash: hash || "",
        filename: filename || "",
        displayName: displayName || "",
      },
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: session.id, url: session.url }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
}