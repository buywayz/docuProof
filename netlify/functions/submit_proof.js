// netlify/functions/submit_proof.js
import { getStore } from "@netlify/blobs";
import { customAlphabet } from "nanoid";

// Create short, unique proof IDs
const makeId = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_",
  12
);

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const { email, hash, filename, displayName, logoUrl } = body;

    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
      return {
        statusCode: 400,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "Invalid or missing hash" }),
      };
    }

    const siteID =
      process.env.NETLIFY_SITE_ID ||
      process.env.SITE_ID ||
      "REDACTED"; // fallback
    const token = process.env.NETLIFY_BLOBS_TOKEN;

    if (!siteID || !token) {
      console.error("Missing Blobs credentials", { siteID, token: !!token });
      return {
        statusCode: 500,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          error: "Blobs environment missing",
          siteID,
          tokenSet: !!token,
        }),
      };
    }

    // ✅ Explicitly initialize with siteID and token
    const store = getStore({
      name: "proofs",
      siteID,
      token,
    });

    const id = makeId();
    const verifyUrl = `https://docuproof.io/v/${id}`;
    const createdAt = new Date().toISOString();

    const record = {
      id,
      hash: hash.toLowerCase(),
      filename,
      email: email || null,
      displayName: displayName || null,
      logoUrl: logoUrl || null,
      createdAt,
      verifyUrl,
    };

    await store.set(`proofs/${id}.json`, JSON.stringify(record), {
      contentType: "application/json",
    });

    return {
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true, id, verifyUrl }),
    };
  } catch (err) {
    console.error("submit_proof error:", err);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: "Server error",
        message: String(err?.message || err),
      }),
    };
  }
}