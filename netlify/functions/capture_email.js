// netlify/functions/capture_email.js
// Stores prospect email + proof ID for list building
// Optionally sends proof details via Postmark

const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "POST only" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const email = (body.email || "").trim().toLowerCase();
    const proofId = (body.proofId || "").trim();
    const source = body.source || "free"; // "free" or "paid"

    if (!email || !email.includes("@")) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Valid email required" }) };
    }

    if (!proofId) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Proof ID required" }) };
    }

    // Store to blobs
    const store = getStore({
      name: "email-prospects",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });

    const record = {
      email,
      proofId,
      source,
      capturedAt: new Date().toISOString(),
    };

    // Key by email so we can dedupe, but also store by proof ID for lookup
    await store.set(`email:${email}`, JSON.stringify(record));
    await store.set(`proof:${proofId}`, JSON.stringify(record));

    console.log(`Email captured: ${email} for proof ${proofId} (${source})`);

    // Send proof details email via Postmark if configured
    const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
    if (postmarkToken) {
      try {
        const verifyUrl = `https://docuproof.io/v/${proofId}`;
        
        await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Postmark-Server-Token": postmarkToken,
          },
          body: JSON.stringify({
            From: "docuProof <noreply@docuproof.io>",
            To: email,
            Subject: `Your docuProof — Proof ID: ${proofId}`,
            HtmlBody: `
              <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0d10; color: #e8eaed; padding: 32px; border-radius: 12px;">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h1 style="color: #22c55e; margin: 0;">docuProof</h1>
                  <p style="color: #8b949e; margin: 4px 0 0;">Proof you can point to.</p>
                </div>
                
                <div style="background: #12161c; border: 1px solid #21262d; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                  <p style="color: #8b949e; font-size: 13px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.1em;">Your Proof ID</p>
                  <p style="font-family: monospace; font-size: 18px; color: #22c55e; margin: 0; word-break: break-all;">${proofId}</p>
                </div>
                
                <p style="color: #c9d2db; line-height: 1.6;">
                  Your file's unique fingerprint has been submitted for anchoring on the Bitcoin blockchain. 
                  This typically takes 1–3 hours.
                </p>
                
                <p style="color: #c9d2db; line-height: 1.6;">
                  <strong style="color: #e8eaed;">What to do next:</strong><br>
                  Save this email. Once your proof is anchored, you can verify it anytime at the link below.
                </p>
                
                <div style="text-align: center; margin: 24px 0;">
                  <a href="${verifyUrl}" style="display: inline-block; background: #22c55e; color: #0a0d10; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 16px;">Check Your Proof Status</a>
                </div>
                
                <div style="border-top: 1px solid #21262d; padding-top: 16px; margin-top: 24px; text-align: center;">
                  <p style="color: #6b7280; font-size: 13px; margin: 0;">
                    docuProof.io — Bitcoin-anchored proof of existence
                  </p>
                </div>
              </div>
            `,
            TextBody: `Your docuProof Proof ID: ${proofId}\n\nYour file's fingerprint has been submitted for anchoring on the Bitcoin blockchain.\n\nCheck your proof status: ${verifyUrl}\n\ndocuProof.io — Proof you can point to.`,
            MessageStream: "outbound",
          }),
        });
        console.log(`Proof details email sent to ${email}`);
      } catch (emailErr) {
        console.error("Postmark send error:", emailErr);
        // Don't fail the request if email fails — we already captured the address
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, message: "Email saved and proof details sent" }),
    };

  } catch (err) {
    console.error("capture_email error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
