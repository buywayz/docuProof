// netlify/functions/ots_submit.js
// Bridge from docuProof to the OTS sidecar service.
// Takes { id, hash } and asks the sidecar to build & store a receipt.

exports.handler = async (event) => {
  try {
    // 1) Method guard
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      };
    }

    // 2) Parse body
    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      };
    }

    const id = body.id && String(body.id).trim();
    const hash = body.hash && String(body.hash).trim();

    if (!id || !hash) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "id and hash are required" }),
      };
    }

    // Very basic hash sanity check (64 hex chars)
    if (!/^[a-f0-9]{64}$/i.test(hash)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Invalid hash format" }),
      };
    }

    // 3) Sidecar base URL from env
    const base =
      process.env.OTS_SIDECAR_URL ||
      process.env.OTS_SERVICE_URL ||
      null;

    if (!base) {
      console.error("ots_submit: missing OTS_SIDECAR_URL / OTS_SERVICE_URL");
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Sidecar URL not configured",
        }),
      };
    }

    // Normalise & build /submit endpoint
    const sidecarUrl = base.replace(/\/+$/, "") + "/submit";

    // 4) Call the sidecar
    const res = await fetch(sidecarUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hash }),
    });

    const text = await res.text();

    if (!res.ok) {
      // Log details for Netlify function logs
      console.error("ots_submit: sidecar non-2xx", {
        status: res.status,
        statusText: res.statusText,
        body: text.slice(0, 500),
      });
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Sidecar HTTP " + res.status,
          statusText: res.statusText,
          body: text.slice(0, 500),
        }),
      };
    }

    // Try to parse JSON response from sidecar, but don’t depend on it
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        id,
        sidecar: parsed,
      }),
    };
  } catch (err) {
    console.error("ots_submit error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Internal error",
        message: String(err && err.message ? err.message : err),
      }),
    };
  }
};