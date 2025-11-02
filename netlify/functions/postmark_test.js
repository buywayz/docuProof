// netlify/functions/postmark_test.js
// Minimal "hello world" email via Postmark /email (non-template) to verify env + outbound.

const https = require("https");

function postmarkSend(token, payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload), "utf8");
    const req = https.request(
      {
        hostname: "api.postmarkapp.com",
        path: "/email",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Postmark-Server-Token": token,
          "Content-Length": data.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode >= 200 && res.statusCode < 300) return resolve(body);
          const err = new Error(`Postmark ${res.statusCode}: ${body}`);
          err.statusCode = res.statusCode;
          err.body = body;
          reject(err);
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  try {
    const token = process.env.POSTMARK_TOKEN;
    const from  = process.env.FROM_EMAIL || "docuProof <no-reply@docuproof.io>";
    const to    = (event.queryStringParameters?.to || "").trim();

    if (!to || !to.includes("@")) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Add ?to=you@example.com" }),
      };
    }
    if (!token) {
      return {
        statusCode: 200,
        body: "OK (no send; missing POSTMARK_TOKEN)",
      };
    }

    const payload = {
      From: from,
      To: to,
      Subject: "docuProof: Postmark test",
      TextBody: "This is a minimal Postmark test from your Netlify function.",
      MessageStream: "outbound",
    };

    const res = await postmarkSend(token, payload);
    return { statusCode: 200, body: `SENT: ${res}` };
  } catch (e) {
    console.error("[postmark_test] error", e);
    return { statusCode: 200, body: `ERROR: ${e.message || String(e)}` };
  }
};