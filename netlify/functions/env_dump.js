// netlify/functions/env_dump.js
// Full environment dump for debugging Netlify build/runtime propagation

function mask(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length <= 8) return '*'.repeat(s.length);
  return s.slice(0, 2) + '…' + s.slice(-2);
}

exports.handler = async () => {
  const env = process.env;

  const ENV_TABLE = Object.entries(env).map(([k, v]) => ({
    key: k,
    value: /TOKEN|KEY|SECRET|PASSWORD|AUTH/i.test(k) ? mask(v) : v,
    present: !!v,
    length: v ? String(v).length : 0,
  }));

  const summary = {
    NETLIFY_SITE_ID: env.NETLIFY_SITE_ID || null,
    NETLIFY_API_TOKEN_present: !!env.NETLIFY_API_TOKEN,
    NETLIFY_BLOBS_TOKEN_present: !!env.NETLIFY_BLOBS_TOKEN,
    NODE_VERSION: env.NODE_VERSION || null,
    OTS_SIDECAR_URL: env.OTS_SIDECAR_URL || null,
    FROM_EMAIL: env.FROM_EMAIL || null,
    POSTMARK_SERVER_TOKEN_present: !!env.POSTMARK_SERVER_TOKEN,
    ENV_TABLE,
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(summary, null, 2),
  };
};