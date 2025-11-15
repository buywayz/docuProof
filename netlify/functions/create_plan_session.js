// netlify/functions/create_plan_session.js
// Starts Stripe Checkout for subscription plans from the pricing cards.

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const PLAN_PRICE_MAP = {
  starter_monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
  starter_annual:  process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
  pro_monthly:     process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  pro_annual:      process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
};

exports.handler = async (event) => {
  try {
    const method = event.httpMethod || 'GET';
    const query  = event.queryStringParameters || {};
    const plan   = query.plan;

    if (method !== 'GET') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
      };
    }

    if (!plan) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify({ ok: false, error: 'Missing plan parameter' }),
      };
    }

    const priceId = PLAN_PRICE_MAP[plan];

    if (!priceId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify({ ok: false, error: `Unknown plan: ${plan}` }),
      };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      // You can tweak these later if you want a dedicated “plan success” page.
      success_url: `${process.env.URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}/start.html`,
      metadata: {
        plan,
        type: 'subscription-plan',
      },
    });

    // For browser navigation: send the user straight to Stripe Checkout.
    return {
      statusCode: 302,
      headers: {
        Location: session.url,
        'Cache-Control': 'no-store',
      },
      body: '',
    };
  } catch (err) {
    console.error('create_plan_session error:', err);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ ok: false, error: 'Internal server error' }),
    };
  }
};