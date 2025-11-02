// netlify/functions/create_plan_session.js
// CommonJS runtime, mirrors your existing functions style.
// Supports both query patterns: ?plan=starter&billing=monthly  and  ?plan=starter_monthly

const Stripe = require('stripe');
const { URLSearchParams } = require('url');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const ORIGIN = process.env.SITE_ORIGIN || 'https://docuproof.io';

// Price map from env (must be set in Netlify):
// - STRIPE_PRICE_ID                         (one-time)
// - STRIPE_STARTER_MONTHLY_PRICE_ID
// - STRIPE_STARTER_ANNUAL_PRICE_ID
// - STRIPE_PRO_MONTHLY_PRICE_ID
// - STRIPE_PRO_ANNUAL_PRICE_ID
const PRICE_MAP = {
  'one-time': process.env.STRIPE_PRICE_ID,

  'starter:monthly': process.env.STRIPE_STARTER_MONTHLY_PRICE_ID,
  'starter:annual' : process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,

  'pro:monthly': process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
  'pro:annual' : process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
};

// Normalize incoming query/body into { plan, billing }
function normalizeInput(event) {
  // Prefer querystring for GET, but also accept POST JSON body
  const method = event.httpMethod || 'GET';

  // Parse query
  const qs = new URLSearchParams(event.queryStringParameters || {});
  let plan = (qs.get('plan') || '').trim().toLowerCase();
  let billing = (qs.get('billing') || '').trim().toLowerCase();
  let email = (qs.get('email') || '').trim();

  // Accept legacy one-token styles: starter_monthly, pro_annual, etc.
  if (!billing && plan.includes('_')) {
    const [p, cyc] = plan.split('_');
    plan = p;
    billing = cyc;
  }

  // Accept POST body with JSON { plan, billing, email }
  if (method === 'POST' && event.body) {
    try {
      const body = JSON.parse(event.body);
      if (!plan && body.plan) plan = String(body.plan).toLowerCase();
      if (!billing && body.billing) billing = String(body.billing).toLowerCase();
      if (!email && body.email) email = String(body.email);
    } catch {
      // ignore JSON parse errors; validation will catch later
    }
  }

  // Defaults: allow one-time without billing
  if (plan === 'one-time') billing = 'none';

  return { plan, billing, email };
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj),
  };
}

exports.handler = async (event) => {
  try {
    if (!['GET', 'POST'].includes(event.httpMethod)) {
      return json(405, { error: 'Method not allowed' });
    }

    // Basic env presence check
    if (!process.env.STRIPE_SECRET_KEY) {
      return json(500, { error: 'Stripe not configured' });
    }

    const { plan, billing, email } = normalizeInput(event);

    // Validate inputs
    const allowedPlans = new Set(['one-time', 'starter', 'pro']);
    const allowedBilling = new Set(['none', 'monthly', 'annual']);

    if (!plan || !allowedPlans.has(plan)) {
      return json(400, { error: `Invalid plan. Use one of: one-time, starter, pro` });
    }
    if (plan === 'one-time') {
      // billing is ignored/forced to 'none'
    } else {
      if (!billing || !allowedBilling.has(billing) || billing === 'none') {
        return json(400, { error: `Invalid billing for subscriptions. Use monthly or annual` });
      }
    }

    // Resolve price
    const key = plan === 'one-time' ? 'one-time' : `${plan}:${billing}`;
    const priceId = PRICE_MAP[key];
    if (!priceId) {
      return json(400, { error: `Missing Stripe price for ${key}. Set the appropriate STRIPE_*_PRICE_ID env.` });
    }

    // Build session
    const successUrl = `${ORIGIN}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${ORIGIN}/app`;

    // Common metadata you already pass elsewhere (optional here)
    const metadata = {};
    // If you want to persist plan/billing in metadata:
    metadata.plan = plan;
    metadata.billing = billing;

    let session;

    if (plan === 'one-time') {
      // One-time payment
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          { price: priceId, quantity: 1 },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: email || undefined, // allow blank
        metadata,
      });
    } else {
      // Subscriptions
      session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          { price: priceId, quantity: 1 },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: email || undefined,
        metadata,
      });
    }

    return json(200, { ok: true, id: session.id, url: session.url });
  } catch (err) {
    // Surface helpful errors without leaking secrets
    return json(500, { error: err.message || 'Failed to create plan session' });
  }
};