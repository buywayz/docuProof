// netlify/functions/called_it_reminders.mjs
// Called It: monthly "Did you call it?" emails for people who opted in.
// Runs at 15:00 UTC (10 AM ET) on the 1st, 2nd and 3rd of each month (see netlify.toml).
// Each run emails about the month that just ended. Only 2027 months are sent
// (first email Feb 1, 2027; final year-end scorecard Jan 1, 2028).
// Re-runs on the 2nd/3rd only pick up anyone the 1st missed: each record keeps
// a list of months already sent, so nobody gets the same email twice.
//
// We never store predictions. The file stays on the customer's device, so the
// email asks them to open their own called-it-2027.txt.

const SITE = process.env.URL || "https://docuproof.io";
const TIME_BUDGET_MS = 22000; // scheduled functions are stopped at 30s
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

async function getStore() {
  const mod = await import("@netlify/blobs");
  const gs = mod.getStore || (mod.default && mod.default.getStore);
  try {
    return gs("called-it-reminders");
  } catch {
    return gs({
      name: "called-it-reminders",
      siteID: process.env.NETLIFY_SITE_ID || process.env.SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN,
    });
  }
}

// The month that just ended, relative to `now` (UTC).
export function previousMonth(now = new Date()) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(); // m = 0..11, current month
  return m === 0 ? { year: y - 1, index: 11 } : { year: y, index: m - 1 };
}

export function buildEmail({ index, proofId, unsubUrl }) {
  const month = MONTHS[index];
  const verifyUrl = `${SITE}/v/${encodeURIComponent(proofId)}`;
  const left = 11 - index;
  const isFinal = index === 11;

  const subject = isFinal
    ? "2027 is over. How many did you call?"
    : `${month}'s over. Did you call it?`;

  const intro = isFinal
    ? "2027 is in the books. Time for your scorecard."
    : `${month} 2027 is in the books. Time to check your ${index === 0 ? "first " : ""}prediction.`;

  const step2 = isFinal
    ? "Count how many of your 12 picks came true."
    : `Find your ${month} pick. Did it happen?`;

  const missed = isFinal
    ? "<strong>Didn't go your way?</strong> Nobody calls them all. Try again for 2028."
    : `<strong>Missed?</strong> There ${left === 1 ? "is 1 more month" : `are ${left} more months`} to go.`;
  const missedText = isFinal
    ? "Didn't go your way? Nobody calls them all. Try again for 2028."
    : `Missed? There ${left === 1 ? "is 1 more month" : `are ${left} more months`} to go.`;

  const html = `<!DOCTYPE html><html><body style="margin:0;background:#0b0f14;padding:24px 12px">
<div style="max-width:560px;margin:0 auto;background:#11161d;border:1px solid #1f2933;border-radius:14px;padding:28px;font-family:Arial,Helvetica,sans-serif;color:#e6edf3;font-size:16px;line-height:1.55">
  <p style="margin:0 0 16px">Hi there,</p>
  <p style="margin:0 0 16px">${intro}</p>
  <ol style="margin:0 0 18px;padding-left:22px">
    <li style="margin-bottom:6px">Open your sealed file, <strong>called-it-2027.txt</strong> (the one you downloaded when you sealed your picks).</li>
    <li>${step2}</li>
  </ol>
  <p style="margin:0 0 18px"><strong>Called it?</strong> Show your friends. Your timestamp proves you wrote it down before anyone knew how it would turn out, and anyone can check it here:</p>
  <p style="margin:0 0 22px"><a href="${verifyUrl}" style="display:inline-block;background:#f59e0b;color:#000;font-weight:bold;text-decoration:none;padding:12px 20px;border-radius:10px">Verify my predictions &rarr;</a></p>
  <p style="margin:0 0 22px">${missed}</p>
  <p style="margin:0 0 22px">&mdash; docuProof</p>
  <p style="margin:0;color:#8b98a5;font-size:13px">Keep your file safe. We never saw it, because it stayed on your device, so it's the only copy that matches your timestamp.<br><br><a href="${unsubUrl}" style="color:#8b98a5">Unsubscribe from Called It reminders</a></p>
</div></body></html>`;

  const text = `Hi there,

${intro}

1. Open your sealed file, called-it-2027.txt (the one you downloaded when you sealed your picks).
2. ${step2}

Called it? Show your friends. Your timestamp proves you wrote it down before anyone knew how it would turn out, and anyone can check it here:
${verifyUrl}

${missedText}

- docuProof

Keep your file safe. We never saw it, because it stayed on your device, so it's the only copy that matches your timestamp.
Unsubscribe: ${unsubUrl}`;

  return { subject, html, text };
}

async function sendPostmark(to, { subject, html, text }, unsubUrl) {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify({
      From: process.env.POSTMARK_FROM || "docuProof <no-reply@docuproof.io>",
      To: to,
      Subject: subject,
      HtmlBody: html,
      TextBody: text,
      MessageStream: "outbound",
      Headers: [{ Name: "List-Unsubscribe", Value: `<${unsubUrl}>` }],
    }),
  });
  if (!res.ok) throw new Error(`Postmark ${res.status}: ${await res.text()}`);
}

export const handler = async () => {
  const started = Date.now();
  const { year, index } = previousMonth();
  if (year !== 2027) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: `not a 2027 month (${year}-${index + 1})` }) };
  }
  if (!process.env.POSTMARK_SERVER_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: "POSTMARK_SERVER_TOKEN missing" }) };
  }

  const tag = `2027-${String(index + 1).padStart(2, "0")}`;
  const store = await getStore();
  const { blobs = [] } = await store.list({ prefix: "r:" });

  let sent = 0, skipped = 0, errors = 0, stoppedForTime = false;
  for (const { key } of blobs) {
    if (Date.now() - started > TIME_BUDGET_MS) { stoppedForTime = true; break; }
    try {
      const raw = await store.get(key);
      if (!raw) { skipped++; continue; }
      const r = JSON.parse(raw);
      if (r.unsubscribed || (r.sent || []).includes(tag)) { skipped++; continue; }
      // Don't email about a month that ended before they sealed (e.g. sealed mid-2027).
      if (new Date(r.sealedAt) >= new Date(Date.UTC(year, index + 1, 1))) { skipped++; continue; }

      const unsubUrl = `${SITE}/.netlify/functions/called_it_unsubscribe?id=${encodeURIComponent(r.proofId)}&t=${r.token}`;
      await sendPostmark(r.email, buildEmail({ index, proofId: r.proofId, unsubUrl }), unsubUrl);
      r.sent = [...(r.sent || []), tag];
      await store.set(key, JSON.stringify(r));
      sent++;
    } catch (e) {
      errors++;
      console.error("[called_it_reminders]", key, e.message);
    }
  }

  console.log(`[called_it_reminders] ${tag}: sent ${sent}, skipped ${skipped}, errors ${errors}, total ${blobs.length}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, month: tag, sent, skipped, errors, total: blobs.length, stoppedForTime }) };
};
