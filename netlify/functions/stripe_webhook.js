// netlify/functions/stripe_webhook.js
// CommonJS runtime (Node 18 on Netlify)
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

    // --- 3) Fire-and-forget anchoring job via submit_proof (non-blocking) ---
    // CRITICAL: submit_proof must be keyed by canonicalId so verify works by canonicalId.
    try {
      if (hash) {
        const submitUrl = `${origin}/.netlify/functions/submit_proof`;
        const body = {
          id: canonicalId, // <-- canonical id is the proof identity
          hash,
          filename,
          displayName,
          customerEmail: to,
          source: "stripe_webhook",
          stripeSessionId, // optional for debugging
        };

        fetch(submitUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then((res) => {
            if (!res.ok) {
              console.error(
                "submit_proof returned non-2xx:",
                res.status,
                res.statusText
              );
            }
          })
          .catch((err) => {
            console.error("submit_proof fire-and-forget error:", err);
          });
      } else {
        console.warn(
          `No hash in session metadata for ${stripeSessionId}; skipping submit_proof.`
        );
      }
    } catch (submitErr) {
      console.error("submit_proof scheduling error (non-fatal):", submitErr);
    }

    // --- 4) Generate PDF certificate via proof_pdf (use canonical quickId) ---
    const qs = new URLSearchParams({
      id: canonicalId, // <-- canonical id on the certificate
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

    // --- 5) Email certificate via Postmark (best-effort) --------------------
    try {
      const attachments = [];
      if (pdfB64) {
        attachments.push({
          Name: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
          Content: pdfB64,
          ContentType: "application/pdf",
        });
      }

      const verifyUrl = `${origin}/v/${canonicalId}`;

      await sendEmail({
        to,
        subject: `Your Proof Certificate: ${displayName}`,
        htmlBody: `
          <p>Thanks for using docuProof.io.</p>
          <p>Your proof certificate is attached as a PDF.</p>
          <p><strong>Proof ID:</strong> <code>${canonicalId}</code></p>
          <p>Verify any time at <a href="${verifyUrl}">${verifyUrl}</a></p>
        `,
        textBody:
          `Thanks for using docuProof.io.\n\n` +
          `Your proof certificate is attached (PDF).\n` +
          `Proof ID: ${canonicalId}\n` +
          `Verify any time at ${verifyUrl}\n`,
        attachments,
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
        id: stripeSessionId,          // keep for Stripe/debug
        canonicalId,                  // your real Proof ID
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