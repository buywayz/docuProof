// netlify/functions/stripe_webhook.js
// CommonJS runtime
const Stripe = require("stripe");
const { sendEmail } = require("./_email");
const { saveProof, appendToFeeds } = require("./_db");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

/** Get site origin for self-calling functions (proof_pdf, submit_proof) */
function siteOrigin(event) {
  // Netlify provides process.env.URL in prod; fallback to request host
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

  // If you verify Stripe signatures, keep your existing logic here.
  // For this flow, we accept the JSON as-is.
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const type = payload?.type;
  const obj = payload?.data?.object || {};

  // We only care about completed Checkout Sessions
  if (type === "checkout.session.completed") {
    try {
      const to = obj.customer_email;
      if (!to) throw new Error("Missing customer_email in Stripe session");

      // Metadata from create_checkout_session
      const md = obj.metadata || {};
      const displayName = md.displayName || "Document Proof";
      const filename =
        md.filename && md.filename.trim()
          ? md.filename.trim()
          : "DocuProof-Certificate.pdf";
      const hash = md.hash || null;
      const shortId = md.shortId || null;

      // Canonical proof id: the Checkout Session id
      const proofId = obj.id;

      const origin = siteOrigin(event);
      if (!origin) throw new Error("Could not determine site origin");

      // -------------------------------------------------------------------
      // 1) Persist proof metadata to Netlify Blobs (via _db)
      // -------------------------------------------------------------------
      try {
        const record = await saveProof({
          id: proofId,
          filename,
          displayName,
          hash,
          customerEmail: to,
          source: "stripe_webhook",
          createdAt: new Date().toISOString(),
        });

        // Best-effort feed update (history + per-email view)
        await appendToFeeds(record);
      } catch (dbErr) {
        console.error("saveProof/appendToFeeds error (non-fatal):", dbErr);
        // Do not fail the webhook if persistence has a transient problem
      }

      // -------------------------------------------------------------------
      // 2) Fire-and-forget anchoring job via submit_proof
      //    (we don't block the webhook on anchoring)
      // -------------------------------------------------------------------
      try {
        if (hash) {
          const submitUrl = `${origin}/.netlify/functions/submit_proof`;
          const body = {
            id: proofId,
            hash,
            filename,
            displayName,
            customerEmail: to,
            shortId,
            source: "stripe_webhook",
          };

          // Fire and forget: start the request, but don't await its result.
          // We only log if the promise later rejects.
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
            `No hash in session metadata for ${proofId}; skipping submit_proof.`
          );
        }
      } catch (submitErr) {
        console.error("submit_proof scheduling error (non-fatal):", submitErr);
        // Still continue with PDF + email
      }

      // -------------------------------------------------------------------
      // 3) Generate PDF certificate via existing proof_pdf function
      // -------------------------------------------------------------------
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

      // -------------------------------------------------------------------
      // 4) Email certificate via Postmark
      // -------------------------------------------------------------------
      await sendEmail({
        to,
        subject: `Your Proof Certificate: ${displayName}`,
        htmlBody: `
          <p>Thanks for using docuProof.io.</p>
          <p>Your proof certificate is attached as a PDF.</p>
          <p>Reference: <code>${proofId}</code></p>
          <p>You can always verify later at <a href="${origin}/verify">${origin}/verify</a>
          using your Proof ID.</p>
        `,
        textBody:
          `Thanks for using docuProof.io.\n\n` +
          `Your proof certificate is attached (PDF).\n` +
          `Reference: ${proofId}\n` +
          `You can always verify later at ${origin}/verify using your Proof ID.\n`,
        attachments: [
          {
            Name: filename.endsWith(".pdf") ? filename : `${filename}.pdf`,
            Content: pdfB64,
            ContentType: "application/pdf",
          },
        ],
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, emailed: true, id: proofId }),
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