// netlify/functions/stripe_probe.js
exports.handler = async () => {
  try {
    // Just prove the module loads; no package.json access
    const stripe = require('stripe');
    const ok = typeof stripe === 'function' || typeof stripe === 'object';
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok, loaded: !!stripe })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: false,
        error: String(e),
        cwd: process.cwd(),
        requirePaths: module.paths
      })
    };
  }
};