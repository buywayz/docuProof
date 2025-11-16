// netlify/functions/stripe_webhook.js
// CommonJS runtime
const Stripe = require("stripe");
const { sendEmail } = require("./_email");
const { blobs } = require("@netlify/blobs");  // NEW: Netlify Blobs for idempotency

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

/** Get site origin for self-calling proof_pdf */
function siteOrigin(event) {
  // Netlify provides process.env.URL in prod; fallback to request host
  const url =
    process.env.URL ||
    (event.headers && event.headers.host && `https://${event.headers.host}`) ||
    "";
  return url.replace(/\/$/, "");
}

/** ArrayBuffer -> base64 string */
async function arrayBufferToBase64(ab) {
  return Buffer.from(new Uint8Array(ab)).toString("base64");
}

// --- Idempotency helpers (avoid duplicate emails on Stripe retries) ---

async function wasProcessed(sessionId) {
  const store = blobs({ name: "processed_sessions" });
  const existing = await store.get(sessionId);
  return existing !== null;
}

async function markProcessed(sessionId) {
  const store = blobs({ name: "processed_sessions" });
  // Value content is irrelevant; existence of the key is what matters.
  await store.set(sessionId, "1");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  // If you verify Stripe signatures, keep your existing logic here.
  // For this test flow, we accept the JSON as-is.
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const type = payload?.type;
  const obj = payload?.data?.object || {};

  if (type === "checkout.session.completed") {
    try {
      const to = obj.customer_email;
      if (!to) throw new Error("Missing customer_email in Stripe session");

      // Pull identifiers from metadata; fall back to the session id
      const displayName = obj.metadata?.displayName || "Document Proof";
      const filename = obj.metadata?.filename || "DocuProof-Certificate.pdf";
      const proofId = obj.metadata?.proofId || obj.id;
      const sessionId = obj.id;

      // Idempotency: if we've already processed this session, skip sending again
      if (await wasProcessed(sessionId)) {
        return {
          statusCode: 200,
          body: JSON.stringify({ ok: true, alreadyProcessed: true }),
        };
      }

      // Fetch your already-working PDF from the existing function
      const origin = siteOrigin(event);
      if (!origin) throw new Error("Could not determine site origin");

      // Build proof_pdf URL, passing through metadata so the certificate
      // shows the actual filename and display name the user entered.
      const qs = new URLSearchParams({
        id: proofId,
        filename,
        displayName,
      }).toString();

      const pdfUrl = `${origin}/.netlify/functions/proof_pdf?${qs}`;
      const pdfRes = await fetch(pdfUrl, { method: "GET" });
      if (!pdfRes.ok) {
        const errText = await pdfRes.text().catch(() => "");
        throw new Error(`proof_pdf failed ${pdfRes.status}: ${errText}`);
      }
      const pdfB64 = await arrayBufferToBase64(await pdfRes.arrayBuffer());

      // Compose & send via Postmark (helper uses POSTMARK_SERVER_TOKEN/POSTMARK_FROM)
      await sendEmail({
        to,
        subject: `Your Proof Certificate: ${displayName}`,
        htmlBody: `
          <p>Thanks for using docuProof.io.</p>
          <p>Your proof certificate is attached as a PDF.</p>
          <p>Reference: <code>${proofId}</code></p>
        `,
        textBody:
          `Thanks for using docuProof.io.\n\n` +
          `Your proof certificate is attached (PDF).\n` +
          `Reference: ${proofId}\n`,
        attachments: [
          {
            Name: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
            Content: pdfB64,
            ContentType: "application/pdf",
          },
        ],
      });

      // Mark this session as processed so retries don't send duplicates
      await markProcessed(sessionId);

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, emailed: true }),
      };
    } catch (err) {
      console.error("stripe_webhook error:", err);
      return {
        statusCode: 500,
        body: JSON.stringify({ ok: false, error: err.message }),
      };
    }
  }

  // Non-target events: succeed no-op
  return {
    statusCode: 200,
    body: JSON.stringify({ ok: true, ignored: type }),
  };
};