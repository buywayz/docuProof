// netlify/functions/_verified.js
// v1.1.0 — Starter/Pro subscribers unlock the badge immediately on subscribing
// v1.0.0 — docuProof Verified badge auto-unlock
//
// Called by stripe_webhook.js after each paid/promo proof is saved.
//  1) Tracks how many timestamps each customer has made
//       Key: customer:{sha256(email)}   (store "proofs")
//  2) At 5+ timestamps, OR as soon as they subscribe to a plan (badge not yet sent):
//       - creates the public verification record  verified:{slug}
//       - emails the customer their badge (Postmark)
//  3) After unlocking, keeps the "documents" count on their page up to date.
//
// Everything here is best-effort: errors are logged and never break the webhook.

const crypto = require("crypto");
const { getStore, listProofs } = require("./_db");
const { sendEmail } = require("./_email");

const THRESHOLD = 5;
const SITE = "https://docuproof.io";
const LOGO_URL = `${SITE}/docuproof-logo.png`;

// Personal mailbox domains: slug/name come from the part before the @ instead of the domain
const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "live.com", "msn.com", "icloud.com", "me.com",
  "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me", "gmx.com",
  "gmx.net", "mail.com", "zoho.com", "yandex.com", "comcast.net", "att.net",
  "verizon.net", "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net",
  "earthlink.net", "fastmail.com", "hey.com", "tutanota.com", "qq.com",
  "163.com", "web.de", "hotmail.co.uk", "yahoo.co.uk", "btinternet.com",
]);

// ── helpers ────────────────────────────────────────────────────────────────

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function emailHash(email) {
  return crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function titleCase(s) {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Default public name + slug for a customer, derived from their email. */
function deriveIdentity(email) {
  const e = normalizeEmail(email);
  const [local = "", domain = ""] = e.split("@");
  if (!domain || PERSONAL_DOMAINS.has(domain)) {
    // jim.ross@gmail.com → "Jim Ross", jim-ross
    const cleaned = local.split("+")[0].replace(/[._-]+/g, " ").replace(/[0-9]+/g, " ").trim();
    const name = titleCase(cleaned) || "docuProof Member";
    return { name, baseSlug: slugify(cleaned) || "member" };
  }
  // jane@acme-law.com → "acme-law.com", acme-law-com
  return { name: domain, baseSlug: slugify(domain) };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function readJson(store, key) {
  try {
    const v = await store.get(key, { type: "json" });
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

async function writeJson(store, key, value, opts = {}) {
  return store.set(key, JSON.stringify(value), {
    contentType: "application/json",
    ...opts,
  });
}

// ── badge HTML (email signature) ───────────────────────────────────────────

/**
 * Signature badge. Links sit inside each cell (not around the table) because
 * Outlook drops links that wrap a whole table.
 */
function badgeHtml(slug) {
  const url = `${SITE}/verified/${slug}`;
  return (
    `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">` +
    `<tr>` +
    `<td style="padding:0 8px 0 0;vertical-align:middle;">` +
    `<a href="${url}" style="text-decoration:none;">` +
    `<img src="${LOGO_URL}" width="24" height="24" alt="docuProof" style="display:block;border:0;" />` +
    `</a></td>` +
    `<td style="font-family:Arial,sans-serif;font-size:13px;vertical-align:middle;white-space:nowrap;">` +
    `<a href="${url}" style="text-decoration:none;">` +
    `<strong style="color:#22c55e;">docuProof</strong>` +
    `<span style="color:#888888;"> VERIFIED &#10003;</span>` +
    `</a></td>` +
    `</tr></table>`
  );
}

// ── customer counter ───────────────────────────────────────────────────────

/**
 * Record one timestamp for this customer and return the updated customer record.
 * Counts unique proof IDs, so Stripe retries never double-count. On first sight
 * of a customer it also picks up their earlier timestamps from the email feed.
 */
async function recordProof(store, { email, proofId, createdAt, subscription }) {
  const norm = normalizeEmail(email);
  const key = `customer:${emailHash(norm)}`;
  const now = new Date().toISOString();

  const existing = (await readJson(store, key)) || {};
  const ids = new Set(Array.isArray(existing.proofIds) ? existing.proofIds : []);
  let firstProofAt = existing.firstProofAt || null;

  // Backfill from the per-email feeds (covers proofs made before this feature)
  if (!existing.email) {
    const feeds = new Set([email, norm]);
    for (const f of feeds) {
      const items = await listProofs({ email: f, limit: 200 }).catch(() => []);
      for (const it of items) {
        if (it && it.id && it.hash) {
          ids.add(it.id);
          if (it.createdAt && (!firstProofAt || it.createdAt < firstProofAt)) {
            firstProofAt = it.createdAt;
          }
        }
      }
    }
  }

  const when = createdAt || now;
  if (proofId) {
    ids.add(proofId);
    if (!firstProofAt || when < firstProofAt) firstProofAt = when;
  }

  const customer = {
    email: norm,
    proofCount: ids.size,
    proofIds: Array.from(ids),
    firstProofAt,
    lastProofAt: proofId ? when : existing.lastProofAt || null,
    subscriber: existing.subscriber === true || !!subscription,
    subscriptionPlan: (subscription && subscription.plan) || existing.subscriptionPlan || null,
    subscribedAt: existing.subscribedAt || (subscription ? now : null),
    verifiedAt: existing.verifiedAt || null,
    badgeSent: existing.badgeSent === true,
    badgeSentAt: existing.badgeSentAt || null,
    slug: existing.slug || null,
    updatedAt: now,
  };

  await writeJson(store, key, customer);
  return { key, customer };
}

/** Find a free slug. Re-uses the slug if it already belongs to this email. */
async function claimSlug(store, baseSlug, email) {
  for (let i = 1; i <= 50; i++) {
    const slug = i === 1 ? baseSlug : `${baseSlug}-${i}`;
    const rec = await readJson(store, `verified:${slug}`);
    if (!rec || normalizeEmail(rec.email) === email) return slug;
  }
  return `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;
}

// ── badge email ────────────────────────────────────────────────────────────

function planLabel(plan) {
  const p = String(plan || "").toLowerCase();
  if (p.includes("pro")) return "Pro";
  if (p.includes("starter")) return "Starter";
  return "";
}

function buildBadgeEmail({ name, slug, count, subscriber, plan }) {
  const label = planLabel(plan);
  const reasonHtml = subscriber
    ? `As a docuProof${label ? ` <strong style="color:#ffffff;">${label}</strong>` : ""} subscriber, you're automatically docuProof Verified.`
    : `You've timestamped <strong style="color:#ffffff;">${count} documents</strong> on the blockchain.`;
  const reasonText = subscriber
    ? `As a docuProof${label ? ` ${label}` : ""} subscriber, you're automatically docuProof Verified.`
    : `You've timestamped ${count} documents on the blockchain.`;
  const pageUrl = `${SITE}/verified/${slug}`;
  const copyUrl = `${SITE}/verified/${slug}/badge`;
  const badge = badgeHtml(slug);
  const n = escapeHtml(name);

  const step = (title, body) => `
    <tr><td style="padding:0 0 14px;">
      <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#e8eaed;">${title}</p>
      <p style="margin:0;font-size:14px;line-height:1.55;color:#a8b0b9;">${body}</p>
    </td></tr>`;

  const htmlBody = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0d10;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0d10;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;font-family:Arial,Helvetica,sans-serif;color:#e8eaed;">

  <tr><td align="center" style="padding:0 0 8px;">
    <img src="${LOGO_URL}" width="64" height="64" alt="docuProof" style="display:block;border:0;border-radius:14px;" />
  </td></tr>
  <tr><td align="center" style="padding:8px 0 4px;">
    <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#22c55e;">${subscriber ? "Subscriber perk unlocked" : "Milestone unlocked"}</p>
  </td></tr>
  <tr><td align="center" style="padding:0 0 12px;">
    <h1 style="margin:0;font-size:30px;line-height:1.2;color:#ffffff;">You're docuProof Verified &#10003;</h1>
  </td></tr>
  <tr><td align="center" style="padding:0 12px 28px;">
    <p style="margin:0;font-size:16px;line-height:1.6;color:#c9d2db;">
      ${reasonHtml}
      That earns you the docuProof Verified badge &mdash; a trust signal that shows clients your
      important documents are independently verifiable and tamper-proof.
    </p>
  </td></tr>

  <!-- Badge preview + primary CTA -->
  <tr><td style="background:#12161c;border:2px solid #22c55e;border-radius:16px;padding:28px 24px;" align="center">
    <p style="margin:0 0 14px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#8b949e;">Your signature badge</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:10px;">
      <tr><td style="padding:14px 20px;">${badge}</td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
      <tr><td align="center" style="background:#22c55e;border-radius:999px;">
        <a href="${copyUrl}" style="display:inline-block;padding:15px 34px;font-size:16px;font-weight:700;color:#0a0d10;text-decoration:none;">Copy my badge in one click &rarr;</a>
      </td></tr>
    </table>
    <p style="margin:14px 0 0;font-size:13px;line-height:1.5;color:#8b949e;">
      Opens a page with a <strong style="color:#c9d2db;">Copy badge</strong> button. Click it, then paste into your signature settings.
    </p>
  </td></tr>

  <!-- Verification page -->
  <tr><td style="padding:24px 4px 4px;">
    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#e8eaed;">Your public verification page</p>
    <p style="margin:0;font-size:14px;line-height:1.55;color:#a8b0b9;">
      Anyone who clicks your badge lands here, showing <strong style="color:#e8eaed;">${n}</strong> as docuProof Verified:<br/>
      <a href="${pageUrl}" style="color:#22c55e;word-break:break-all;">${pageUrl}</a>
    </p>
    <p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#8b949e;">
      Want a different business name shown on your page? Just reply to this email and tell us.
    </p>
  </td></tr>

  <!-- Setup instructions -->
  <tr><td style="padding:28px 4px 0;">
    <h2 style="margin:0 0 16px;font-size:18px;color:#ffffff;">Add it to your email signature</h2>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${step("Gmail", `Click <strong style="color:#e8eaed;">Copy badge</strong> on your badge page. In Gmail, open <strong style="color:#e8eaed;">Settings (gear) &rarr; See all settings &rarr; General &rarr; Signature</strong>. Click inside your signature, paste (Ctrl+V / &#8984;V), then scroll down and click <strong style="color:#e8eaed;">Save Changes</strong>.`)}
      ${step("Outlook", `Click <strong style="color:#e8eaed;">Copy badge</strong>. <em>Outlook on the web &amp; new Outlook:</em> Settings &rarr; Mail (or Accounts) &rarr; Signatures &rarr; paste &rarr; Save. <em>Classic Outlook for Windows:</em> File &rarr; Options &rarr; Mail &rarr; Signatures &rarr; paste &rarr; OK.`)}
      ${step("Apple Mail", `Click <strong style="color:#e8eaed;">Copy badge</strong>. In Mail, open <strong style="color:#e8eaed;">Mail &rarr; Settings &rarr; Signatures</strong>, pick your signature, uncheck &ldquo;Always match my default message font&rdquo;, then paste the badge into the signature box.`)}
    </table>
  </td></tr>

  <!-- Raw HTML -->
  <tr><td style="padding:12px 4px 0;">
    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#e8eaed;">Using an HTML signature editor or your website?</p>
    <p style="margin:0 0 8px;font-size:13px;color:#8b949e;">Paste this code instead (the badge page also has a &ldquo;Copy HTML code&rdquo; button):</p>
    <div style="background:#0d1117;border:1px solid #21262d;border-radius:8px;padding:12px;font-family:Menlo,Consolas,monospace;font-size:11px;line-height:1.5;color:#9fb3c8;word-break:break-all;">${escapeHtml(badge)}</div>
  </td></tr>

  <tr><td align="center" style="padding:32px 0 0;border-top:1px solid #21262d;">
    <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">docuProof.io &mdash; Blockchain-anchored proof of existence</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;

  const textBody =
    `You're docuProof Verified!\n\n` +
    `${reasonText} That earns you the docuProof Verified badge.\n\n` +
    `Copy your badge in one click: ${copyUrl}\n` +
    `Your public verification page: ${pageUrl}\n\n` +
    `Gmail: Settings > See all settings > General > Signature > paste > Save Changes.\n` +
    `Outlook: Settings > Mail > Signatures > paste > Save (classic Outlook: File > Options > Mail > Signatures).\n` +
    `Apple Mail: Mail > Settings > Signatures > uncheck "Always match my default message font" > paste.\n\n` +
    `Want a different business name on your page? Reply to this email.\n\n` +
    `docuProof.io — Blockchain-anchored proof of existence\n`;

  return {
    subject: "You're docuProof Verified ✓ — your badge is ready",
    htmlBody,
    textBody,
  };
}

// ── main entry ─────────────────────────────────────────────────────────────

/**
 * Call after a proof is saved. Never throws.
 * @returns {Promise<object>} summary for logging
 */
async function trackProofAndMaybeUnlock({ email, proofId, createdAt, subscription }) {
  try {
    if (!email || (!proofId && !subscription)) return { ok: false, reason: "missing email or proofId" };
    const store = await getStore();
    if (!store) return { ok: false, reason: "blobs unavailable" };

    const { key: customerKey, customer } = await recordProof(store, { email, proofId, createdAt, subscription });
    console.log(`[verified] ${customer.email} now has ${customer.proofCount} timestamp(s)${customer.subscriber ? " (subscriber)" : ""}`);

    // Already verified → keep the public page's document count current
    if (customer.badgeSent && customer.slug) {
      const vKey = `verified:${customer.slug}`;
      const v = await readJson(store, vKey);
      if (v && ((v.documents || 0) < customer.proofCount || (customer.subscriber && !v.subscriber))) {
        await writeJson(store, vKey, {
          ...v,
          documents: Math.max(v.documents || 0, customer.proofCount),
          subscriber: v.subscriber || customer.subscriber,
          plan: v.plan || customer.subscriptionPlan || null,
          updatedAt: new Date().toISOString(),
        });
      }
      return { ok: true, proofCount: customer.proofCount, alreadyVerified: true, slug: customer.slug };
    }

    if (customer.proofCount < THRESHOLD && !customer.subscriber) {
      return { ok: true, proofCount: customer.proofCount, unlocked: false };
    }

    // ── Threshold hit: take a one-time lock so concurrent webhooks can't double-send
    const lockKey = `badge-lock:${emailHash(customer.email)}`;
    const lock = await store.set(lockKey, new Date().toISOString(), { onlyIfNew: true });
    if (lock && lock.modified === false) {
      console.log(`[verified] badge already being processed for ${customer.email}`);
      return { ok: true, proofCount: customer.proofCount, unlocked: false, locked: true };
    }

    try {
      const { name, baseSlug } = deriveIdentity(customer.email);
      const slug = customer.slug || (await claimSlug(store, baseSlug, customer.email));
      const nowIso = new Date().toISOString();

      const existingV = await readJson(store, `verified:${slug}`);
      const verified = {
        slug,
        name: existingV?.name || name,
        email: customer.email,
        since: existingV?.since || nowIso,
        documents: customer.proofCount,
        subscriber: customer.subscriber,
        plan: customer.subscriptionPlan || null,
        active: true,
        createdAt: existingV?.createdAt || nowIso,
        updatedAt: nowIso,
      };
      await writeJson(store, `verified:${slug}`, verified);

      const mail = buildBadgeEmail({
        name: verified.name,
        slug,
        count: customer.proofCount,
        // Subscriber wording only when the subscription (not the 5 timestamps) is what unlocked it
        subscriber: customer.subscriber && customer.proofCount < THRESHOLD,
        plan: customer.subscriptionPlan,
      });
      await sendEmail({ to: customer.email, ...mail });

      await writeJson(store, customerKey, {
        ...customer,
        slug,
        verifiedAt: customer.verifiedAt || nowIso,
        badgeSent: true,
        badgeSentAt: nowIso,
        updatedAt: nowIso,
      });

      console.log(`[verified] 🎉 badge unlocked + emailed: ${customer.email} → /verified/${slug}`);
      return { ok: true, proofCount: customer.proofCount, unlocked: true, slug };
    } catch (err) {
      // Release the lock so the next timestamp retries the unlock
      try { await store.delete(lockKey); } catch {}
      throw err;
    }
  } catch (err) {
    console.error("[verified] trackProofAndMaybeUnlock error (non-fatal):", err);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/** Look up a verified business by slug (used by verified_check.js). */
async function getVerified(slug) {
  const store = await getStore();
  if (!store || !slug) return null;
  return readJson(store, `verified:${slug}`);
}

module.exports = {
  trackProofAndMaybeUnlock,
  getVerified,
  badgeHtml,
  buildBadgeEmail,
  deriveIdentity,
  escapeHtml,
  THRESHOLD,
};
