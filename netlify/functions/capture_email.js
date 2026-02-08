// netlify/functions/capture_email.js
// Stores prospect email + proof ID for list building
// Writes to Google Sheets + Netlify Blobs
// Optionally sends proof details via Postmark

const { getStore } = require("@netlify/blobs");
const crypto = require("crypto");

// Google Sheets helper — uses raw REST API (no npm dependency needed)
async function appendToGoogleSheet(email, source, capturedAt) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!sheetId || !clientEmail || !privateKey) {
    console.warn("Google Sheets env vars missing — skipping sheet append");
    return;
  }

  try {
    // Build JWT
    const header = { alg: "RS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    };

    const encode = (obj) =>
      Buffer.from(JSON.stringify(obj)).toString("base64url");

    const unsigned = encode(header) + "." + encode(claim);
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(unsigned);
    const signature = signer.sign(privateKey, "base64url");
    const jwt = unsigned + "." + signature;

    // Exchange JWT for access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Google token error:", errText);
      return;
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Append row to Sheet1
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A:C:append?valueInputOption=USER_ENTERED`;
    const appendRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [[email, source, capturedAt]],
      }),
    });

    if (!appendRes.ok) {
      const errText = await appendRes.text();
      console.error("Google Sheets append error:", errText);
    } else {
      console.log(`Google Sheets: appended row for ${email}`);
    }
  } catch (err) {
    console.error("Google Sheets error:", err);
    // Don't fail the request if Sheets fails
  }
}

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
    const source = body.source || "free"; // "free", "paid", "prelaunch-landing", etc.

    if (!email || !email.includes("@")) {
      return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Valid email required" }) };
    }

    const capturedAt = new Date().toISOString();

    // Store to Netlify Blobs
    const store = getStore({
      name: "email-prospects",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });

    const record = {
      email,
      proofId: proofId || null,
      source,
      capturedAt,
    };

    // Key by email so we can dedupe
    await store.set(`email:${email}`, JSON.stringify(record));
    // Also store by proof ID if provided
    if (proofId) {
      await store.set(`proof:${proofId}`, JSON.stringify(record));
    }

    console.log(`Email captured: ${email} (source: ${source}${proofId ? `, proof: ${proofId}` : ""})`);

    // Append to Google Sheet
    await appendToGoogleSheet(email, source, capturedAt);

    // Send proof details email via Postmark if configured AND proofId provided
    const postmarkToken = process.env.POSTMARK_SERVER_TOKEN;
    if (postmarkToken && proofId) {
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
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, message: "Email saved" }),
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
