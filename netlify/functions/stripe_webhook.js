// netlify/functions/stripe_webhook.js
// CommonJS runtime (Node 18 on Netlify)
// v3.0.0 - Certificate PDF deferred to resolve_cron (sent after anchoring with block number)
//         - Writes email to email-prospects store so resolve_cron can find it
//         - Initial email is receipt-only (no PDF attachment)
const Stripe = require("stripe");
const crypto = require("crypto");
const { sendEmail } = require("./_email");
const { saveProof, appendToFeeds, getProof } = require("./_db");

// --- helpers ---------------------------------------------------------------

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

/**
 * Canonical Proof ID strategy:
 * 1) Prefer metadata.canonicalId (set by create_checkout_session)
 * 2) Else derive a stable 12-hex id from the Stripe session id (deterministic)
 */
function canonicalIdFromSession(sessionId, md = {}) {
  const fromMd =
    md.canonicalId ||
    md.canonical_id ||
    md.proofId ||
    md.proof_id ||
    md.pid ||
    null;

  if (fromMd && typeof fromMd === "string" && fromMd.trim()) {
    return fromMd.trim();
  }

  // deterministic fallback (stable across retries)
  if (sessionId && typeof sessionId === "string") {
    return crypto.createHash("sha256").update(sessionId).digest("hex").slice(0, 12);
  }

  // last-resort (should never happen)
  return crypto.randomBytes(6).toString("hex");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

// --- handler ---------------------------------------------------------------

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // NOTE: Stripe signature verification is handled externally in your setup.
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const type = payload?.type;
  const obj = payload?.data?.object || {};

  // We only care about completed Checkout Sessions
  if (type !== "checkout.session.completed") {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ignored: type || null }),
    };
  }

  const stripeSessionId = obj.id; // cs_live_... or cs_test_...
  const md = obj.metadata || {};

  const canonicalId = canonicalIdFromSession(stripeSessionId, md);
  const origin = siteOrigin(event);
  if (!origin) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: "Could not determine site origin" }),
    };
  }

  try {
    // --- 1) Idempotency is now keyed on canonicalId (NOT Stripe session id) ---
    const existing = canonicalId ? await getProof(canonicalId).catch(() => null) : null;
    if (existing && existing.emailSentAt) {
      console.log("stripe_webhook: duplicate event, already emailed", {
        canonicalId,
        stripeSessionId,
      });
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          duplicate: true,
          id: stripeSessionId,
          canonicalId,
          verifyUrl: `${origin}/v/${canonicalId}`,
          livemode: !!obj.livemode,
        }),
      };
    }

    const to = obj.customer_email;
    if (!to) throw new Error("Missing customer_email in Stripe session");

    // Metadata from create_checkout_session
    const displayName = md.displayName || "Document Proof";
    const filename =
      md.filename && md.filename.trim()
        ? md.filename.trim()
        : "DocuProof-Certificate.pdf";
    const hash = md.hash || null;

    // Preserve original createdAt if record already exists; otherwise now.
    const nowIso =
      existing?.createdAt && typeof existing.createdAt === "string"
        ? existing.createdAt
        : new Date().toISOString();

    // Email idempotency markers
    const emailMarkTime = new Date().toISOString();
    const emailCount =
      typeof existing?.emailCount === "number" ? existing.emailCount + 1 : 1;

    // --- 2) Persist / update proof metadata (Blobs) + history feeds ----------
    // IMPORTANT: write emailSentAt BEFORE sending email to stop Stripe retries
    let record = null;
    try {
      record = await saveProof({
        // Canonical identity
        id: canonicalId,

        // User/content metadata
        filename,
        displayName,
        hash,
        customerEmail: to,
        createdAt: nowIso,

        // Operational metadata
        source: "stripe_webhook",
        emailSentAt: emailMarkTime,
        emailCount,

        // Stripe metadata (stored as attributes, not identity)
        stripe: {
          session_id: stripeSessionId,
          payment_status: obj.payment_status || null,
          mode: obj.mode || null,
          amount_total: obj.amount_total ?? null,
          currency: obj.currency || null,
        },
      });

      await appendToFeeds(record);
    } catch (dbErr) {
      console.error("saveProof/appendToFeeds error (non-fatal):", dbErr);
      // Do not fail webhook on persistence hiccups
    }

    // --- 2b) Write to email-prospects store so resolve_cron can find email ---
    try {
      const blobMod = await import("@netlify/blobs");
      const gs = blobMod.getStore || (blobMod.default && blobMod.default.getStore);
      let emailStore;
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const blobToken = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
      try {
        emailStore = gs("email-prospects");
      } catch {
        emailStore = gs({ name: "email-prospects", siteID, token: blobToken });
      }

      const emailRecord = JSON.stringify({
        email: to,
        proofId: canonicalId,
        source: "paid",
        capturedAt: emailMarkTime,
      });
      await emailStore.set(`email:${to}`, emailRecord);
      await emailStore.set(`proof:${canonicalId}`, emailRecord);
      console.log(`[stripe_webhook] Email saved to email-prospects for ${canonicalId}`);
    } catch (epErr) {
      console.error("[stripe_webhook] email-prospects write error (non-fatal):", epErr);
    }

    // --- 3) AWAIT anchoring job via submit_proof ---
    // CRITICAL FIX: must await this call. Fire-and-forget gets killed
    // when the Netlify function returns, so the OTS submission never completes.
    try {
      if (hash) {
        const submitUrl = `${origin}/.netlify/functions/submit_proof`;
        const submitBody = {
          id: canonicalId,
          hash,
          filename,
          displayName,
          customerEmail: to,
          source: "stripe_webhook",
          stripeSessionId,
        };

        console.log(`[stripe_webhook] Submitting to OTS: ${canonicalId}`);

        const submitResp = await fetch(submitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(submitBody),
        });

        if (!submitResp.ok) {
          const errText = await submitResp.text().catch(() => "");
          console.error(
            `[stripe_webhook] submit_proof returned ${submitResp.status}: ${errText}`
          );
        } else {
          console.log(`[stripe_webhook] OTS submission succeeded for ${canonicalId}`);
        }
      } else {
        console.warn(
          `[stripe_webhook] No hash in session metadata for ${stripeSessionId}; skipping submit_proof.`
        );
      }
    } catch (submitErr) {
      console.error("[stripe_webhook] submit_proof error (non-fatal):", submitErr);
    }

    // --- 4) Send receipt email (NO certificate yet — cert comes after anchoring) ---
    // The PDF certificate will be generated and attached by resolve_cron.mjs
    // once the proof is ANCHORED, so it includes the Bitcoin block number.
    try {
      const verifyUrl = `${origin}/.netlify/functions/verify_page?id=${encodeURIComponent(canonicalId)}&source=paid`;

      await sendEmail({
        to,
        subject: `Your docuProof — Proof ID: ${canonicalId}`,
        htmlBody: `
          <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0d10; color: #e8eaed; padding: 32px; border-radius: 12px;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #22c55e; margin: 0;">docuProof</h1>
              <p style="color: #8b949e; margin: 4px 0 0;">Proof you can point to.</p>
            </div>

            <div style="background: #12161c; border: 1px solid #21262d; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
              <p style="color: #8b949e; font-size: 13px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.1em;">Your Proof ID</p>
              <p style="font-family: monospace; font-size: 18px; color: #22c55e; margin: 0; word-break: break-all;">${canonicalId}</p>
            </div>

            <p style="color: #c9d2db; line-height: 1.6;">
              Your file's unique fingerprint has been submitted for anchoring on the Bitcoin blockchain.
              This typically takes 1–3 hours.
            </p>
            <p style="color: #c9d2db; line-height: 1.6;">
              <strong style="color: #e8eaed;">Your PDF Certificate of Proof</strong> will be emailed to you
              once your proof is permanently anchored — it will include the Bitcoin block number
              and all the details needed for legal verification.
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
        textBody:
          `Thanks for using docuProof.io.\n\n` +
          `Your Proof ID: ${canonicalId}\n\n` +
          `Your file's fingerprint has been submitted for anchoring on the Bitcoin blockchain.\n` +
          `This typically takes 1-3 hours.\n\n` +
          `Your PDF Certificate of Proof will be emailed to you once anchoring is complete.\n\n` +
          `Check your proof status: ${verifyUrl}\n\n` +
          `docuProof.io — Proof you can point to.\n`,
      });
    } catch (emailErr) {
      // Log but DO NOT throw (avoid Stripe retry storms / dupes)
      console.error("Postmark sendEmail error (non-fatal):", emailErr);
    }

    // --- response (useful for Stripe dashboard delivery logs) ---------------
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        id: stripeSessionId,
        canonicalId,
        verifyUrl: `${origin}/v/${canonicalId}`,
        livemode: !!obj.livemode,
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
