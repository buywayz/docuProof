// netlify/functions/create_checkout_session.js
// CommonJS (matches your functions runtime)
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const PRICE_MAP = {
  'one-time':         process.env.STRIPE_PRICE_ID,                  // single proof
  'starter-monthly':  process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
  'starter-annual':   process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
  'pro-monthly':      process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  'pro-annual':       process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
};

async function createSessionForPlan(plan) {
  const priceId = PRICE_MAP[plan];

  if (!priceId) {
    throw new Error(`Unknown plan: ${plan}`);
  }

  const isSubscription = plan !== 'one-time';

  const session = await stripe.checkout.sessions.create({
    mode: isSubscription ? 'subscription' : 'payment',
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: `${process.env.URL}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.URL}/app`,
    metadata: {
      plan,
    },
  });

  return session;
}

exports.handler = async (event) => {
  try {
    // --- CASE 1: Called from a plain link: GET /create_checkout_session?plan=starter-monthly
    if (event.httpMethod === 'GET') {
      const { plan } = event.queryStringParameters || {};

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

      const session = await createSessionForPlan(plan);

      // Redirect the browser straight to Stripe Checkout
      return {
        statusCode: 302,
        headers: {
          Location: session.url,
          'Cache-Control': 'no-store',
        },
        body: '',
      };
    }

    // --- CASE 2: Called via fetch/XHR: POST with JSON body { plan: "starter-monthly" }
    if (event.httpMethod === 'POST') {
      const body = event.body ? JSON.parse(event.body) : {};
      const { plan } = body;

      if (!plan) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
          body: JSON.stringify({ ok: false, error: 'Missing plan in request body' }),
        };
      }

      const session = await createSessionForPlan(plan);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify({
          ok: true,
          id: session.id,
          url: session.url,
        }),
      };
    }

    // --- All other methods not allowed
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
    };
  } catch (err) {
    console.error('create_checkout_session error:', err);

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