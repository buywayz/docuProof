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

// Small helper: derive a compact id from a hex hash (no external deps)
function shortIdFromHash(h) {
  if (!h || typeof h !== 'string') return undefined;
  const m = h.toLowerCase().match(/[0-9a-f]{12,}/);
  return m ? m[0].slice(0, 12) : undefined;
}

async function createStripeSession(payload) {
  const {
    email = '',
    hash = '',
    filename = '',
    displayName = '',
    plan = 'one-time',
    billing = 'none',
  } = payload;

  const priceId = PRICE_MAP[plan];
  if (!priceId) {
    throw new Error(`Unknown plan: ${plan}`);
  }

  const isSubscription = plan !== 'one-time';
  const shortId = shortIdFromHash(hash) || undefined;

  const session = await stripe.checkout.sessions.create({
    mode: isSubscription ? 'subscription' : 'payment',
    customer_email: email || undefined,
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
      billing,
      email,
      hash,
      filename,
      displayName,
      shortId,
    },
  });

  return session;
}

exports.handler = async (event) => {
  try {
    const method  = event.httpMethod || 'GET';
    const headers = event.headers || {};

    const contentType =
      headers['content-type'] ||
      headers['Content-Type'] ||
      '';

    const accept =
      headers['accept'] ||
      headers['Accept'] ||
      '';

    const wantsHtml = accept.includes('text/html');

    // ---- Normalize input (plan/email/hash/...) from either JSON or form or query ----
    let bodyData = {};
    if (event.body) {
      if (contentType.includes('application/json')) {
        try {
          bodyData = JSON.parse(event.body);
        } catch (e) {
          console.error('Failed to parse JSON body:', e);
          bodyData = {};
        }
      } else {
        // Assume URL-encoded form or similar
        try {
          const params = new URLSearchParams(event.body);
          bodyData = Object.fromEntries(params.entries());
        } catch (e) {
          console.error('Failed to parse form body:', e);
          bodyData = {};
        }
      }
    }

    // Plan can come from body or query
    const queryParams = event.queryStringParameters || {};
    if (!bodyData.plan && queryParams.plan) {
      bodyData.plan = queryParams.plan;
    }

    // ---- Allow GET or POST. Others rejected. ----
    if (method !== 'GET' && method !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
      };
    }

    if (!bodyData.plan) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
        body: JSON.stringify({ ok: false, error: 'Missing plan' }),
      };
    }

    // ---- Create the Stripe session (includes all metadata) ----
    const session = await createStripeSession(bodyData);

    // ---- If the caller "wants HTML", treat this as a browser navigation and redirect ----
    if (wantsHtml) {
      return {
        statusCode: 302,
        headers: {
          Location: session.url,
          'Cache-Control': 'no-store',
        },
        body: '',
      };
    }

    // ---- Otherwise, behave as JSON API ----
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