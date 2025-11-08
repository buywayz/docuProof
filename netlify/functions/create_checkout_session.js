// netlify/functions/create_checkout_session.js
// CommonJS (matches your functions runtime)
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const PRICE_MAP = {
  'one-time':         process.env.STRIPE_PRICE_ID,                 // single proof
  'starter-monthly':  process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
  'starter-annual':   process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
  'pro-monthly':      process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  'pro-annual':       process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
};

// Small helper: derive a compact id from a hex hash (no external deps)
function shortIdFromHash(h) {
  if (!h || typeof h !== 'string') return undefined;
  // take first 12 hex chars; safe, stable, URL-friendly
  const m = h.toLowerCase().match(/[0-9a-f]{12,}/);
  return m ? m[0].slice(0, 12) : undefined;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const {
      email,
      hash = '',
      filename = '',
      displayName = '',
      plan = 'one-time',
      billing = 'none',
      // OPTIONAL: allow callers to send a proofId explicitly
      proofId: inputProofId = '',
    } = JSON.parse(event.body || '{}');

    // Server-side email guard (block checkout if missing/invalid)
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Email is required' }),
      };
    }

    // choose price
    let planKey = plan;
    if (plan !== 'one-time') {
      planKey = `${plan}-${billing}`; // e.g. "starter-monthly"
    }
    const priceId = PRICE_MAP[planKey];
    if (!priceId) {
      throw new Error(`Unknown plan selection: ${planKey}`);
    }

    // base site origin for redirects
    const base = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:8888';

    // Build query string with optional fields for success redirect
    const params = new URLSearchParams();
    if (filename)    params.set('filename', filename);
    if (displayName) params.set('displayName', displayName);
    if (hash)        params.set('hash', hash);
    const extraQS = params.toString();
    const successUrl =
      `${base}/success.html?session_id={CHECKOUT_SESSION_ID}` + (extraQS ? `&${extraQS}` : '');

    // Decide a proofId to carry through Stripe metadata.
    // Priority: caller-provided proofId -> short id derived from hash -> (webhook will fallback to session.id)
    const derivedProofId = inputProofId || shortIdFromHash(hash) || '';

    const common = {
      success_url: successUrl,
      cancel_url: `${base}/cancel.html`,
      customer_email: email || undefined,
      metadata: {
        // webhook reads these
        proofId: derivedProofId,  // may be empty string; webhook already falls back to session.id
        hash,
        filename,
        displayName,
        plan: planKey,
      },
    };

    let session;
    if (plan === 'one-time') {
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: 'payment',
        line_items: [{ price: priceId, quantity: 1 }],
      });
    } else {
      session = await stripe.checkout.sessions.create({
        ...common,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      // Return BOTH the URL and the session id
      body: JSON.stringify({ url: session.url, id: session.id }),
    };

  } catch (err) {
    console.error('[create_checkout_session] error', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message || 'Internal Server Error' }),
    };
  }
};