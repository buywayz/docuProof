// netlify/functions/stripe_probe.js
exports.handler = async (event) => {
  const VERSION = "stripe_probe_v2_beacon_2025-12-27_2217ET";

  // Also attempt logs (nice-to-have), but the beacon is the real proof.
  console.log("stripe_probe beacon version:", VERSION);
  console.log("queryStringParameters:", event.queryStringParameters);

  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ok: true,
      loaded: true,
      version: VERSION,
      query: event.queryStringParameters || {},
    }),
  };
};
