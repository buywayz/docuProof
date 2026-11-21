// netlify/functions/called_it_unsubscribe.js
// One-click unsubscribe from Called It monthly reminder emails.
// Link format: /.netlify/functions/called_it_unsubscribe?id=<proofId>&t=<token>

function page(title, msg) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
    body: `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#0b0f14;color:#e6edf3;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:480px;margin:80px auto;padding:28px;background:#11161d;border:1px solid #1f2933;border-radius:14px;text-align:center">
<h1 style="font-size:22px;margin:0 0 12px">${title}</h1><p style="margin:0 0 20px;color:#8b98a5">${msg}</p>
<a href="/" style="color:#f59e0b">docuproof.io</a></div></body></html>`,
  };
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const id = String(q.id || "");
  const t = String(q.t || "");
  if (!id || !t) return page("Link not recognized", "This unsubscribe link is incomplete.");

  try {
    const mod = await import("@netlify/blobs");
    const gs = mod.getStore || (mod.default && mod.default.getStore);
    let store;
    try {
      store = gs("called-it-reminders");
    } catch {
      store = gs({
        name: "called-it-reminders",
        siteID: process.env.NETLIFY_SITE_ID || process.env.SITE_ID,
        token: process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN,
      });
    }
    const key = `r:${id}`;
    const raw = await store.get(key);
    if (!raw) return page("Link not recognized", "We couldn't find that reminder signup.");
    const r = JSON.parse(raw);
    if (r.token !== t) return page("Link not recognized", "This unsubscribe link doesn't match.");
    if (!r.unsubscribed) {
      r.unsubscribed = true;
      r.unsubscribedAt = new Date().toISOString();
      await store.set(key, JSON.stringify(r));
    }
    return page("You're unsubscribed", "You won't get any more Called It reminder emails. Your timestamp and your file are unaffected.");
  } catch (e) {
    console.error("[called_it_unsubscribe]", e);
    return page("Something went wrong", "Please try the link again in a minute.");
  }
};
