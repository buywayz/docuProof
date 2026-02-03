// netlify/functions/create_free_proof.js
// v3.0.0 - Creates a FREE proof with SYNCHRONOUS anchoring submission
// CRITICAL FIX: Awaits OTS submission instead of fire-and-forget
// (fire-and-forget gets killed when the Netlify function returns)

const { saveProof, appendToFeeds } = require("./_db");

function generateProofId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `free_${timestamp}${random}`;
}

function isValidSHA256(hash) {
  return typeof hash === "string" && /^[0-9a-fA-F]{64}$/i.test(hash);
}

function sanitizeFilename(str, maxLength = 255) {
  if (!str || typeof str !== "string") return "document";
  return (
    str
      .replace(/[\x00-\x1F\x7F]/g, "")
      .replace(/[<>:"/\\|?*]/g, "")
      .replace(/\.\./g, "")
      .trim()
      .slice(0, maxLength) || "document"
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { hash, filename, displayName, source } = body;

    if (!hash || !isValidSHA256(hash)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Invalid hash. Must be a 64-character hexadecimal SHA-256 hash.",
        }),
      };
    }

    const proofId = generateProofId();
    const now = new Date();
    const sanitizedFilename = sanitizeFilename(filename);
    const sanitizedDisplayName = sanitizeFilename(displayName) || sanitizedFilename;
    const origin = process.env.URL || "https://docuproof.io";

    // 1. Save proof record
    const proofRecord = {
      id: proofId,
      hash: hash.toLowerCase(),
      filename: sanitizedFilename,
      displayName: sanitizedDisplayName,
      customerEmail: null,
      createdAt: now.toISOString(),
      source: source || "free_proof",
      type: "free",
      version: 3,
    };

    await saveProof(proofRecord);
    console.log(`[create_free_proof] Proof saved: ${proofId}`);

    // 2. Add to feeds
    await appendToFeeds(proofRecord);
    console.log(`[create_free_proof] Added to feeds: ${proofId}`);

    // 3. Create initial anchor status in blob store
    try {
      const mod = await import("@netlify/blobs");
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;

      let store;
      if (siteID && token) {
        store = mod.getStore({ name: "proofs", siteID, token });
      } else {
        store = mod.getStore("proofs");
      }

      const anchorStatus = {
        id: proofId,
        state: "PENDING",
        hash: hash.toLowerCase(),
        createdAt: now.toISOString(),
        source: "free_proof",
      };

      await store.set(`anchor:${proofId}.json`, JSON.stringify(anchorStatus), {
        contentType: "application/json",
      });
      console.log(`[create_free_proof] Anchor status created: ${proofId}`);
    } catch (anchorErr) {
      console.error(`[create_free_proof] Anchor status write failed for ${proofId}:`, anchorErr);
      // Continue — proof is saved, OTS submission will still work
    }

    // 4. CRITICAL: Submit to OTS synchronously (await, NOT fire-and-forget)
    //    Call ots_submit directly via internal URL and WAIT for it to complete.
    let otsOk = false;
    let otsDetail = "";
    try {
      const otsUrl = `${origin}/.netlify/functions/ots_submit`;
      console.log(`[create_free_proof] Submitting to OTS: ${proofId} → ${otsUrl}`);

      const otsResp = await fetch(otsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proofId, hash: hash.toLowerCase() }),
      });

      const otsText = await otsResp.text();

      if (otsResp.ok) {
        let otsJson = {};
        try { otsJson = JSON.parse(otsText); } catch {}
        otsOk = otsJson.ok === true;
        otsDetail = otsOk ? "receipt saved" : otsText;
        console.log(`[create_free_proof] OTS submit result for ${proofId}: ok=${otsOk}`);
      } else {
        otsDetail = `HTTP ${otsResp.status}: ${otsText}`;
        console.error(`[create_free_proof] OTS submit failed for ${proofId}: ${otsDetail}`);
      }
    } catch (otsErr) {
      otsDetail = String(otsErr);
      console.error(`[create_free_proof] OTS submit error for ${proofId}:`, otsErr);
    }

    // 5. Return success — proof is saved regardless of OTS result
    const verifyUrl = `${origin}/v/${proofId}`;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({
        ok: true,
        proofId: proofId,
        hash: hash.toLowerCase(),
        filename: sanitizedFilename,
        displayName: sanitizedDisplayName,
        createdAt: proofRecord.createdAt,
        verifyUrl: verifyUrl,
        status: otsOk ? "submitted" : "pending",
        otsSubmitted: otsOk,
        message: otsOk
          ? "Your free proof has been created and submitted for blockchain anchoring."
          : "Your free proof has been created. Blockchain anchoring will be retried automatically.",
        note: "Anchoring typically takes 1-3 hours. Check your verification link for status updates.",
      }),
    };
  } catch (err) {
    console.error("[create_free_proof] Error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "Failed to create proof. Please try again.",
      }),
    };
  }
};
