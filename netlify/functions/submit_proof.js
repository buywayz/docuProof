// netlify/functions/submit_proof.js
// Minimal bridge: accepts {id, hash} and forwards to ots_submit.
// This is what stripe_webhook expects for fire-and-forget stamping.

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Invalid JSON" }),
    };
  }

  const { id, hash } = payload;

  if (!id || typeof id !== "string" || !id.trim()) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Missing or invalid id" }),
    };
  }

  if (!hash || !/^[0-9a-fA-F]{64}$/.test(hash)) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Invalid or missing hash" }),
    };
  }

  try {
    // Forward the request to ots_submit
    const otsUrl = `${process.env.URL}/.netlify/functions/ots_submit`;

    const resp = await fetch(otsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, hash }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("submit_proof → ots_submit error:", resp.status, text);
      // Fire-and-forget semantics: don't fail webhook
      return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ok: false,
          forwarded: false,
          detail: text,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, forwarded: true }),
    };
  } catch (err) {
    console.error("submit_proof error:", err);
    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "submit_proof internal error",
        detail: String(err),
      }),
    };
  }
}
