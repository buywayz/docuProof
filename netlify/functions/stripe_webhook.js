// netlify/functions/stripe_webhook.js
// CommonJS runtime (Node 18)
const Stripe = require("stripe");
const { sendEmail } = require("./_email");
const { saveProof, appendToFeeds, getProof } = require("./_db");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

/** Derive a stable-ish short id from hash (12 hex chars). */
function shortIdFromHash(h) {
  if (!h || typeof h !== "string") return null;
  const m = h.toLowerCase().match(/[0-9a-f]{12,}/);
  return m ? m[0].slice(0, 12) : null;
}

/** Get site origin for self-calling functions (proof_pdf, submit_proof) */
function siteOrigin(event) {
  const url =
    process.env.URL ||
    (event.headers &&
      (event.headers["x-forwarded-host"] || event.headers.host) &&
      `https://${event.headers["x-forwarded-host"] || event.headers.host}`) ||
    "";
  return url.replace(/\/$/, "");
}

/** ArrayBuffer -> base64 string */
async function arrayBufferToBase64(ab) {
  return Buffer.from(new Uint8Array(ab)).toString("base64");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // NOTE: Signature verification is assumed external in your current setup.
  // We accept the JSON as-is.
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const type = payload?.type;
  const obj = payload?.data?.object || {};

  // Only care about completed Checkout Sessions
  if (type !== "checkout.session.completed") {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ignored: type }),
    };
  }

  const sessionId = obj.id; // cs_live_... or cs_test_...

  try {
    const origin = siteOrigin(event);
    if (!origin) throw new Error("Could not determine site origin");

    // --- 1) Idempotency based on the Stripe session id alias record ---
    // We store an alias record keyed by sessionId.
    const existingAlias = sessionId
      ? await getProof(sessionId).catch(() => null)
      : null;

    if (existingAlias && existingAlias.emailSentAt) {
      console.log("stripe_webhook: duplicate event, already emailed", sessionId);
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, duplicate: true, id: sessionId }),
      };
    }

    const to = obj.customer_email;
    if (!to) throw new Error("Missing customer_email in Stripe session");

    // Metadata from create_checkout_session
    const md = obj.metadata || {};
    const displayName = (md.displayName || "").trim() || "Document Proof";
    const filename =
      (md.filename || "").trim() || "DocuProof-Certificate.pdf";
    const hash = md.hash || null;

    // Canonical id: shortId (what your Blobs already uses for /v/<id>)
    // Fallback to a random-ish id if hash missing.
    const canonicalId =
      shortIdFromHash(hash) ||
      Math.random().toString(36).slice(2, 14);

    const nowIso = new Date().toISOString();
    const emailMarkTime = new Date().toISOString();

    // Stripe details
    const stripeInfo = {
      session_id: sessionId,
      payment_status: obj.payment_status,
      mode: obj.mode,
      amount_total: obj.amount_total,
      currency: obj.currency,
      livemode: !!obj.livemode,
    };

    // Canonical verify URL (shortId-based)
    const verifyUrl = `${origin}/v/${canonicalId}`;

    // --- 2) Persist TWO records ---
    // (A) Canonical proof record keyed by canonicalId (shortId)
    // (B) Alias record keyed by sessionId (cs_live...) pointing to canonicalId
    //
    // This allows:
    // - everything that updates proof state (submit_proof/anchor jobs) to target canonicalId
    // - UI inputs that paste cs_live... to still resolve (by looking up alias -> canonical)
    //
    // IMPORTANT: We mark emailSentAt on the alias record BEFORE sending email.
    let canonicalRecord = null;
    let aliasRecord = null;

    try {
      canonicalRecord = await saveProof({
        id: canonicalId,
        hash,
        filename,
        email: to,
        customerEmail: to, // keep backward compatibility if your _db expects this
        displayName,
        logoUrl: md.logoUrl || "https://docuproof.io/apple-touch-icon.png",
        createdAt: nowIso,
        verifyUrl,
        stripe: stripeInfo,
        source: "stripe_webhook",
        // helpful linkage
        aliasSessionId: sessionId,
      });

      // Alias record stored under cs_live... (or cs_test...) so idempotency works and mapping exists
      aliasRecord = await saveProof({
        id: sessionId,
        type: "alias",
        createdAt:
          (existingAlias?.createdAt && typeof existingAlias.createdAt === "string")
            ? existingAlias.createdAt
            : nowIso,
        emailSentAt: emailMarkTime,
        emailCount:
          typeof existingAlias?.emailCount === "number"
            ? existingAlias.emailCount + 1
            : 1,
        // pointer to canonical proof
        canonicalId,
        verifyUrl,
        stripe: stripeInfo,
        source: "stripe_webhook",
      });

      // Keep feeds updated (best effort)
      try {
        if (canonicalRecord) await appendToFeeds(canonicalRecord);
      } catch (e) {
        console.error("appendToFeeds(canonical) error (non-fatal):", e);
      }
      try {
        if (aliasRecord) await appendToFeeds(aliasRecord);
      } catch (e) {
        console.error("appendToFeeds(alias) error (non-fatal):", e);
      }

      console.log("stripe_webhook: saved canonical+alias", {
        sessionId,
        canonicalId,
        livemode: stripeInfo.livemode,
      });
    } catch (dbErr) {
      // If persistence fails, we still return 200? No.
      // Here we DO fail so you see it immediately and Stripe retries (but alias idempotency prevents dup email).
      console.error("stripe_webhook: saveProof failed:", dbErr);
      throw new Error(`Persistence failed: ${dbErr.message || dbErr}`);
    }

    // --- 3) Kick off anchoring job via submit_proof (best effort) ---
    // We send canonicalId as id so anchor/receipt updates land on the canonical proof record.
    try {
      if (hash) {
        const submitUrl = `${origin}/.netlify/functions/submit_proof`;
        const body = {
          id: canonicalId,
          hash,
          filename,
          displayName,
          customerEmail: to,
          source: "stripe_webhook",
          // linkage back to Stripe session (optional; useful for debugging)
          stripeSessionId: sessionId,
        };

        fetch(submitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then(async (res) => {
            if (!res.ok) {
              const txt = await res.text().catch(() => "");
              console.error("submit_proof non-2xx:", res.status, txt);
            } else {
              console.log("submit_proof scheduled OK for", canonicalId);
            }
          })
          .catch((err) => {
            console.error("submit_proof fire-and-forget error:", err);
          });
      } else {
        console.warn(`No hash in session metadata for ${sessionId}; skipping submit_proof.`);
      }
    } catch (submitErr) {
      console.error("submit_proof scheduling error (non-fatal):", submitErr);
    }

    // --- 4) Generate PDF certificate via proof_pdf (best effort) ---
    const qs = new URLSearchParams({
      id: canonicalId, // IMPORTANT: canonicalId for certificate/QR
      filename,
      displayName,
      quickId: canonicalId,
    }).toString();

    const pdfUrl = `${origin}/.netlify/functions/proof_pdf?${qs}`;
    let pdfB64 = null;

    try {
      const pdfRes = await fetch(pdfUrl, { method: "GET" });
      if (!pdfRes.ok) {
        const errText = await pdfRes.text().catch(() => "");
        console.error(`proof_pdf failed ${pdfRes.status}: ${errText}`);
      } else {
        pdfB64 = await arrayBufferToBase64(await pdfRes.arrayBuffer());
      }
    } catch (e) {
      console.error("Error calling proof_pdf:", e);
    }

    // --- 5) Email (best effort; do not throw) ---
    try {
      const attachments = [];
      if (pdfB64) {
        attachments.push({
          Name: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
          Content: pdfB64,
          ContentType: "application/pdf",
        });
      }

      // Email: emphasize canonical verify URL (shortId-based) so users can always verify.
      await sendEmail({
        to,
        subject: `Your Proof Certificate: ${displayName}`,
        htmlBody: `
          <p>Thanks for using docuProof.io.</p>
          <p>Your proof certificate is attached as a PDF.</p>

          <p><strong>Verify link:</strong> <a href="${verifyUrl}">${verifyUrl}</a></p>

          <p><strong>Proof ID (for verify):</strong> <code>${canonicalId}</code></p>
          <p><strong>Stripe Session:</strong> <code>${sessionId}</code></p>

          <p>You can also visit <a href="${origin}/verify">${origin}/verify</a> and paste your Proof ID.</p>
        `,
        textBody:
          `Thanks for using docuProof.io.\n\n` +
          `Verify link: ${verifyUrl}\n` +
          `Proof ID (for verify): ${canonicalId}\n` +
          `Stripe Session: ${sessionId}\n\n` +
          `You can also visit ${origin}/verify and paste your Proof ID.\n`,
        attachments,
      });

      console.log("stripe_webhook: email sent OK", { sessionId, canonicalId });
    } catch (emailErr) {
      console.error("Postmark sendEmail error (non-fatal):", emailErr);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        id: sessionId,
        canonicalId,
        verifyUrl,
        livemode: stripeInfo.livemode,
      }),
    };
  } catch (err) {
    console.error("stripe_webhook error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};