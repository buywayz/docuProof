// netlify/functions/stripe_webhook.js
// Verify Stripe event (or accept "test"), build PDF, send Postmark template email, persist proof, then trigger OTS.

const https = require("https");
const crypto = require("crypto");
const { saveProof, appendToFeeds } = require("./_db");

// Ensure @netlify/blobs can be resolved in this function bundle
async function _warmupBlobs() {
  try { await import('@netlify/blobs'); } catch {}
}

// GET a URL into a Buffer (for fetching your PDF)
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

// POST to Postmark Template endpoint
function postmarkSendTemplate(token, payload) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload), "utf8");
    const req = https.request(
      {
        hostname: "api.postmarkapp.com",
        path: "/email/withTemplate",
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
  // Make sure module is available…
  await _warmupBlobs();

  // …and initialize Blobs for Lambda-compat functions
  try {
    const { connectLambda } = await import('@netlify/blobs');
    await connectLambda(event);
  } catch (e) {
    console.warn("[stripe_webhook] connectLambda failed:", e?.message);
  }

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Method Not Allowed" }),
      };
    }

    const sig = event.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    // Normalize raw body (Netlify may pass base64)
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";

    let evt;
    if (sig === "test") {
      // Test path: accept the payload as-is
      evt = JSON.parse(rawBody);
    } else {
      // Production path: verify Stripe signature
      const Stripe = require("stripe");
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2024-06-20",
      });
      evt = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    }

    if (evt.type !== "checkout.session.completed") {
      return { statusCode: 200, body: "Ignored (not checkout.session.completed)" };
    }

    const session = evt.data.object || {};
    const proofId = session.id;
    const email =
      session?.customer_details?.email || session?.customer_email || "";

    if (!proofId || !email || !email.includes("@")) {
      console.warn("[stripe_webhook] Missing proofId or email on session");
      return { statusCode: 200, body: "OK (missing proofId or email)" };
    }

    // Pull user metadata
    const filename = (session.metadata?.filename || "document.pdf").trim();
    const displayName = (session.metadata?.displayName || "").trim();
    const sha256 = (session.metadata?.hash || "").trim();

    // Build links
    const siteBase =
      process.env.URL || process.env.DEPLOY_URL || "https://docuproof.io";

    // PDF URL (your existing proof_pdf function)
    const pdfUrlObj = new URL("/.netlify/functions/proof_pdf", siteBase);
    pdfUrlObj.searchParams.set("id", proofId);
    if (filename) pdfUrlObj.searchParams.set("filename", filename);
    if (sha256) pdfUrlObj.searchParams.set("hash", sha256);
    if (displayName) pdfUrlObj.searchParams.set("displayName", displayName);

    // Verification page (HTML view)
    const verifyUrl = `${siteBase}/.netlify/functions/verify_page?id=${encodeURIComponent(
      proofId
    )}`;

    // Fetch PDF to attach
    const pdfBuf = await fetchBuffer(pdfUrlObj.toString());
    const pdfB64 = pdfBuf.toString("base64");

    // Quick Verify ID (same derivation as proof_pdf.js)
    const digest = crypto.createHash("sha256").update(proofId).digest();
    const quickId = Buffer.from(digest).toString("base64url").slice(0, 10);

    // Postmark config
    const token = process.env.POSTMARK_SERVER_TOKEN || process.env.POSTMARK_TOKEN;
    const templateId = process.env.POSTMARK_TEMPLATE_ID_CERT;
    const from = process.env.FROM_EMAIL || "docuProof <no-reply@docuproof.io>";
    if (!token || !templateId) {
      console.error("[stripe_webhook] Missing POSTMARK_TOKEN or POSTMARK_TEMPLATE_ID_CERT");
      return { statusCode: 200, body: "OK (email not sent; Postmark config missing)" };
    }

    // Send templated email
    const payload = {
      From: from,
      To: email,
      TemplateId: Number(templateId),
      TemplateModel: {
        proofId,
        quickId,
        filename,
        hash: sha256 || "(pending)",
        verifyUrl,
        pdfUrl: pdfUrlObj.toString(),
        year: new Date().getFullYear(),
      },
      Attachments: [
        {
          Name: `docuProof_${quickId}.pdf`,
          Content: pdfB64,
          ContentType: "application/pdf",
        },
      ],
      MessageStream: "outbound",
      TrackOpens: true,
    };

    await postmarkSendTemplate(token, payload);
    console.log("[stripe_webhook] Sent templated email for", proofId, "to", email);

    // --- Persist proof metadata to Netlify Blobs + append to feeds (idempotent) ---
    try {
      const record = await saveProof({
        id: proofId,
        filename,
        displayName,
        hash: sha256 || null,
        customerEmail: email,
        createdAt: new Date().toISOString(),
        source: "stripe_webhook",
      });
      await appendToFeeds(record);
      console.log("[docuProof] Saved proof metadata and updated feeds:", proofId);

      // --- OTS submission trigger (secure call to ots_submit) -----------------
      try {
        const otsUrl = new URL("/.netlify/functions/ots_submit", siteBase);
        otsUrl.searchParams.set("id", proofId);
        if (sha256) otsUrl.searchParams.set("hash", sha256);

        // Optional HMAC guard (only active if OTS_INTERNAL_HMAC is set)
        if (process.env.OTS_INTERNAL_HMAC) {
          const msg = `${proofId}.${sha256 || crypto.createHash("sha256").update(proofId).digest("hex")}`;
          const sig = crypto
            .createHmac("sha256", process.env.OTS_INTERNAL_HMAC)
            .update(msg)
            .digest("hex");
          otsUrl.searchParams.set("sig", sig);
        }

        // Use fetch (Node 18+ global) to fire-and-forget the submit
        await fetch(otsUrl.toString(), { method: "GET" });
        console.log("[OTS] submit triggered for", proofId);
      } catch (e) {
        console.warn("[OTS] submit trigger failed:", e?.message);
      }
      // ------------------------------------------------------------------------

    } catch (e) {
      // Do NOT fail the webhook—email already sent. Log and continue.
      console.warn("[docuProof] Failed to save proof or update feeds:", e?.message);
    }

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("[stripe_webhook] fatal:", err);
    // Return 200 so Stripe (or curl) doesn’t retry forever during manual tests
    return { statusCode: 200, body: "OK (handled with warnings)" };
  }
};