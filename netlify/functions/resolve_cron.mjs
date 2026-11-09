// netlify/functions/resolve_cron.mjs
// v6.1.0 - MONITORING: emails the owner (ALERT_EMAIL, default buywayzllc@gmail.com) when
//           a customer proof is stuck >12h, a submission keeps failing, or the sidecar is
//           unreachable. Each problem is reported once. Plus a Monday "all clear" summary
//           so silence never has to be trusted.
// v6.0.0 - FIX: pending proofs were never checked once >40 anchor records existed.
//           The batch was the first 40 keys alphabetically (anchored ones included),
//           so proofs whose IDs start late in the alphabet were starved forever.
//         - Now: only NOT-anchored records are batched, rotated by lastCheckedAt so
//           every pending proof gets checked; stops before the 30s scheduled limit.
//         - SELF-HEAL: recent paid proofs (feed:all) that never got an OTS receipt
//           (submission failed/timed out) are stamped here, so none stay "not found".
// v5.1.0 - FIX: Always reads proof record for filename, displayName, ripPurchased
//         - Previously these were only read in the email fallback path, so paid proofs
//           (which had email in email-prospects) never got metadata → blank fields + no RIP
//         - Proof record is now read FIRST, email-prospects used as fallback for email only
//         - Certificate includes hash, block number, verify URL — court-ready
// Scheduled hourly via netlify.toml: [functions."resolve_cron"] schedule = "@hourly"
//
// Flow:
// 1. List all keys matching "anchor:*.json" in the "proofs" store
// 2. For each that is NOT yet "ANCHORED", load the .ots receipt
// 3. Call OTS sidecar /upgrade to check if Bitcoin has confirmed it
// 4. If upgraded, persist blockHeight, state="ANCHORED", and updated receipt

const OTS_SIDECAR_URL = process.env.OTS_SIDECAR_URL;
const SITE_ORIGIN = process.env.URL || "https://docuproof.io";
const BATCH_LIMIT = 40;          // max pending proofs checked per run
const HEAL_LIMIT = 5;            // max missing submissions repaired per run
const TIME_BUDGET_MS = 22000;    // scheduled functions are killed at 30s
const HEAL_MIN_AGE_MS = 10 * 60 * 1000;          // give the webhook 10 min first
const HEAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // ignore anything older than 30 days

// ── Monitoring ──
const ALERT_EMAIL = process.env.ALERT_EMAIL || "buywayzllc@gmail.com";
const STUCK_AFTER_MS = 12 * 60 * 60 * 1000;     // normal anchoring is 1–6h
const ALERT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // only alert on proofs from the last 7 days
const SUBMIT_ALERT_AFTER_MS = 2 * 60 * 60 * 1000; // a failed submit is retried hourly; alert after 2h
const SIDECAR_ALERT_EVERY_MS = 6 * 60 * 60 * 1000;

async function sendOwnerEmail(subject, html, text) {
  if (!process.env.POSTMARK_SERVER_TOKEN) return;
  try {
    await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
      },
      body: JSON.stringify({
        From: process.env.POSTMARK_FROM || "docuProof <no-reply@docuproof.io>",
        To: ALERT_EMAIL,
        Subject: subject,
        HtmlBody: html,
        TextBody: text,
      }),
    });
  } catch (e) {
    console.error("resolve_cron: owner email failed:", e);
  }
}

/** Mark an alert as sent; returns false if it was already sent (so each problem is reported once). */
async function claimAlert(store, key) {
  try {
    const r = await store.set(`alert:${key}`, new Date().toISOString(), { onlyIfNew: true });
    return !(r && r.modified === false);
  } catch {
    return true;
  }
}

/** Submit a hash to the sidecar and store the receipt + OTS_RECEIPT anchor record. */
async function stampAndStore(store, { id, hash, createdAt, existing = {} }) {
  const resp = await fetch(`${OTS_SIDECAR_URL}/stamp-hash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, hash }),
  });
  if (!resp.ok) throw new Error(`stamp-hash ${resp.status}: ${await resp.text().catch(() => "")}`);
  const j = await resp.json();
  if (!j.ok || !j.receipt_b64) throw new Error("stamp-hash returned no receipt");

  await store.set(`ots/receipts/${id}.ots`, Buffer.from(j.receipt_b64, "base64"), {
    contentType: "application/octet-stream",
  });
  const nowIso = new Date().toISOString();
  await store.set(`anchor:${id}.json`, JSON.stringify({
    ...existing,
    id,
    state: "OTS_RECEIPT",
    hash: String(hash).toLowerCase(),
    receiptStored: true,
    createdAt: existing.createdAt || createdAt || nowIso,
    updatedAt: nowIso,
    resubmittedBy: "resolve_cron",
    resubmittedAt: nowIso,
  }), { contentType: "application/json" });
}

async function readJsonKey(store, key) {
  try {
    const t = await store.get(key, { type: "text" });
    return t ? JSON.parse(t) : null;
  } catch {
    return null;
  }
}

async function hasReceipt(store, id) {
  for (const rk of [`ots/receipts/${id}.ots`, `ots:${id}.receipt`]) {
    try {
      const ab = await store.get(rk, { type: "arrayBuffer" });
      if (ab && ab.byteLength > 0) return true;
    } catch {}
  }
  return false;
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function getStore() {
  const mod = await import("@netlify/blobs");
  const gs = mod.getStore || (mod.default && mod.default.getStore);
  if (!gs) throw new Error("getStore not available from @netlify/blobs");

  // Try automatic binding first (works in Netlify runtime)
  try {
    return gs("proofs");
  } catch (e) {
    // Manual fallback
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
    if (!siteID || !token) {
      throw new Error("Netlify Blobs not bound and manual credentials missing");
    }
    return gs({ name: "proofs", siteID, token });
  }
}

async function getEmailStore() {
  const mod = await import("@netlify/blobs");
  const gs = mod.getStore || (mod.default && mod.default.getStore);
  if (!gs) throw new Error("getStore not available from @netlify/blobs");

  try {
    return gs("email-prospects");
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
    if (!siteID || !token) {
      throw new Error("Netlify Blobs not bound and manual credentials missing");
    }
    return gs({ name: "email-prospects", siteID, token });
  }
}

export const handler = async (_event) => {
  const startedAt = Date.now();
  const timeLeft = () => TIME_BUDGET_MS - (Date.now() - startedAt);
  const alerts = [];          // { title, id?, detail }
  let upgradeCalls = 0;
  let upgradeFailures = 0;
  try {
    if (!OTS_SIDECAR_URL) {
      return json(500, { ok: false, error: "OTS_SIDECAR_URL not configured" });
    }

    const store = await getStore();

    // ─── Step 1: Find all pending anchors ───────────────────────────────
    // List all blobs and filter for anchor:*.json keys
    let anchorKeys = [];
    try {
      const list = await store.list({ prefix: "anchor:" });
      if (list && list.blobs) {
        anchorKeys = list.blobs
          .map((b) => b.key || b.name || b)
          .filter((k) => typeof k === "string" && k.endsWith(".json"));
      }
    } catch (listErr) {
      console.error("resolve_cron: failed to list anchor keys:", listErr);
      return json(500, { ok: false, error: "Failed to list anchor keys", detail: String(listErr) });
    }

    // ─── Step 1b: SELF-HEAL proofs whose OTS submission never happened ──
    // Paid proofs are in feed:all. If one has a hash but no anchor record and no
    // receipt, its submission failed (e.g. a timeout) — stamp it now.
    let healed = 0;
    let healErrors = 0;
    try {
      const anchorSet = new Set(anchorKeys);
      const feed = (await readJsonKey(store, "feed:all")) || [];
      const items = Array.isArray(feed) ? feed : (feed.items || []);
      for (const it of items) {
        if (healed + healErrors >= HEAL_LIMIT || timeLeft() < 12000) break;
        if (!it || !it.id || !it.hash || !/^[0-9a-fA-F]{64}$/.test(it.hash)) continue;
        const age = Date.now() - Date.parse(it.createdAt || 0);
        if (!(age > HEAL_MIN_AGE_MS && age < HEAL_MAX_AGE_MS)) continue;
        const aKey = `anchor:${it.id}.json`;
        if (anchorSet.has(aKey)) continue;
        if (await hasReceipt(store, it.id)) continue;
        try {
          await stampAndStore(store, { id: it.id, hash: it.hash, createdAt: it.createdAt });
          anchorKeys.push(aKey);
          healed++;
          console.log(`resolve_cron: SELF-HEAL stamped missing proof ${it.id}`);
        } catch (e) {
          healErrors++;
          console.error(`resolve_cron: SELF-HEAL failed for ${it.id}:`, e);
          if (age > SUBMIT_ALERT_AFTER_MS && (await claimAlert(store, `submit:${it.id}`))) {
            alerts.push({ title: "Proof could not be submitted for anchoring", id: it.id, detail: `${it.customerEmail || "unknown customer"} — ${String(e.message || e).slice(0, 200)}` });
          }
        }
      }
    } catch (healErr) {
      console.error("resolve_cron: self-heal step failed (non-fatal):", healErr);
    }

    if (anchorKeys.length === 0) {
      return json(200, { ok: true, processed: 0, healed, note: "no anchor records found" });
    }

    // ─── Step 2: Pick pending anchors (not anchored), least-recently-checked first
    // Previously: anchorKeys.slice(0, 40) — included finished proofs and always the
    // same alphabetical first 40, so later IDs were never checked.
    const pendingList = [];
    const stuckCandidates = [];
    let anchoredLast7d = 0;
    let alreadyAnchored = 0;
    for (let i = 0; i < anchorKeys.length; i += 25) {
      const chunk = anchorKeys.slice(i, i + 25);
      const docs = await Promise.all(chunk.map((k) => readJsonKey(store, k)));
      docs.forEach((doc, j) => {
        if (!doc) return;
        if (doc.state === "ANCHORED" && doc.blockHeight > 0) {
          alreadyAnchored++;
          if (Date.now() - (Date.parse(doc.updatedAt || 0) || 0) < ALERT_WINDOW_MS) anchoredLast7d++;
          return;
        }
        const ageMs = Date.now() - (Date.parse(doc.createdAt || 0) || Date.now());
        if (ageMs > STUCK_AFTER_MS && ageMs < ALERT_WINDOW_MS) {
          stuckCandidates.push({ id: chunk[j].replace(/^anchor:/, "").replace(/\.json$/, ""), hours: Math.round(ageMs / 3600000) });
        }
        pendingList.push({
          key: chunk[j],
          last: Date.parse(doc.lastCheckedAt || 0) || 0,
          created: Date.parse(doc.createdAt || doc.updatedAt || 0) || 0,
        });
      });
    }
    pendingList.sort((a, b) => a.last - b.last || a.created - b.created);

    // Stuck customer proofs (>12h, not anchored) — report each one once
    for (const c of stuckCandidates.slice(0, 10)) {
      const pr = await readJsonKey(store, `proof:${c.id}`);
      if (!pr || !pr.customerEmail) continue; // only real customer proofs
      if (await claimAlert(store, `stuck:${c.id}`)) {
        alerts.push({ title: `Customer proof not anchored after ${c.hours} hours`, id: c.id, detail: pr.customerEmail });
      }
    }
    const batch = pendingList.slice(0, BATCH_LIMIT).map((p) => p.key);
    let processed = 0;
    let skipped = 0;
    let upgraded = 0;
    let errors = 0;

    let stoppedForTime = false;
    for (const anchorKey of batch) {
      if (timeLeft() < 4000) { stoppedForTime = true; break; }
      try {
        // Read anchor status
        const raw = await store.get(anchorKey, { type: "text" });
        if (!raw) { processed++; continue; }

        let anchor;
        try {
          anchor = JSON.parse(raw);
        } catch {
          processed++;
          continue;
        }

        // Skip if already anchored with blockHeight
        if (anchor.state === "ANCHORED" && anchor.blockHeight && anchor.blockHeight > 0) {
          skipped++;
          processed++;
          continue;
        }

        // Extract proof ID from key: "anchor:PROOFID.json"
        const id = anchorKey.replace(/^anchor:/, "").replace(/\.json$/, "");
        if (!id) { processed++; continue; }

        // Rotation marker: so the next run starts with proofs not checked recently
        anchor.lastCheckedAt = new Date().toISOString();
        try {
          await store.set(anchorKey, JSON.stringify(anchor), { contentType: "application/json" });
        } catch {}

        // ─── Step 3: Load the .ots receipt ────────────────────────────
        const receiptCandidates = [
          `ots/receipts/${id}.ots`,
          `ots:${id}.receipt`,
        ];

        let receiptBytes = null;
        for (const rk of receiptCandidates) {
          try {
            const ab = await store.get(rk, { type: "arrayBuffer" });
            if (ab && ab.byteLength > 0) {
              receiptBytes = Buffer.from(ab);
              break;
            }
          } catch {}
        }

        if (!receiptBytes) {
          // No receipt: the original submission failed. Re-stamp if we know the hash.
          let hash = anchor.hash || null;
          if (!hash) {
            const pr = (await readJsonKey(store, `proof:${id}`)) || {};
            hash = pr.hash || null;
          }
          if (hash && /^[0-9a-fA-F]{64}$/.test(hash) && healed < HEAL_LIMIT && timeLeft() > 8000) {
            try {
              await stampAndStore(store, { id, hash, existing: anchor });
              healed++;
              console.log(`resolve_cron: SELF-HEAL re-stamped ${id} (anchor had no receipt)`);
            } catch (e) {
              healErrors++;
              console.error(`resolve_cron: SELF-HEAL re-stamp failed for ${id}:`, e);
              const age = Date.now() - (Date.parse(anchor.createdAt || 0) || Date.now());
              if (age > SUBMIT_ALERT_AFTER_MS && age < ALERT_WINDOW_MS && (await claimAlert(store, `submit:${id}`))) {
                alerts.push({ title: "Proof could not be re-submitted for anchoring", id, detail: String(e.message || e).slice(0, 200) });
              }
            }
          }
          processed++;
          continue;
        }

        const receiptB64 = receiptBytes.toString("base64");

        // ─── Step 4: Call sidecar /upgrade ────────────────────────────
        let upgradeResult = null;
        upgradeCalls++;
        try {
          const resp = await fetch(`${OTS_SIDECAR_URL}/upgrade-receipt`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, receiptBase64: receiptB64 }),
          });

          if (resp.ok) {
            upgradeResult = await resp.json();
          } else {
            const text = await resp.text().catch(() => "");
            console.error(`resolve_cron: /upgrade failed for ${id}: ${resp.status} ${text}`);
          }
        } catch (fetchErr) {
          console.error(`resolve_cron: /upgrade fetch error for ${id}:`, fetchErr);
        }

        if (!upgradeResult || !upgradeResult.ok) {
          upgradeFailures++;
          processed++;
          continue;
        }

        // ─── Step 5: Update anchor record ─────────────────────────────
        const newState = upgradeResult.state || "OTS_RECEIPT";
        const txid = upgradeResult.txid || null;
        const blockHeight = upgradeResult.blockHeight || upgradeResult.block_height || upgradeResult.block || null;
        const confirmations = upgradeResult.confirmations || 0;

        let changed = false;

        // Check if we got a Bitcoin confirmation
        if (newState === "ANCHORED" || blockHeight || txid) {
          anchor.state = "ANCHORED";
          anchor.txid = txid || anchor.txid || null;
          anchor.blockHeight = blockHeight || anchor.blockHeight || null;
          anchor.confirmations = confirmations || anchor.confirmations || 0;
          changed = true;
        } else if (newState !== anchor.state) {
          anchor.state = newState;
          changed = true;
        }

        // Always try to save the upgraded receipt
        if (upgradeResult.receiptBase64 || upgradeResult.receipt_b64) {
          try {
            const upgradedBytes = Buffer.from(upgradeResult.receiptBase64 || upgradeResult.receipt_b64, "base64");
            await store.set(`ots/receipts/${id}.ots`, upgradedBytes, {
              contentType: "application/octet-stream",
            });
          } catch (e) {
            console.error(`resolve_cron: failed to save upgraded receipt for ${id}:`, e);
          }
        }

        if (changed) {
          anchor.updatedAt = new Date().toISOString();
          anchor.resolvedBy = "resolve_cron";
          await store.set(anchorKey, JSON.stringify(anchor), {
            contentType: "application/json",
          });
          upgraded++;
          console.log(`resolve_cron: upgraded ${id} → state=${anchor.state}, block=${anchor.blockHeight}`);

          // Send "anchored" notification email with PDF certificate
          if (anchor.state === "ANCHORED" && anchor.blockHeight) {
            try {
              // --- Find email: try email-prospects first, then proofs store ---
              let recipientEmail = null;
              let proofHash = anchor.hash || null;
              let proofFilename = null;
              let proofDisplayName = null;
              let proofCreatedAt = anchor.createdAt || null;
              let proofRipPurchased = false;

              // --- ALWAYS read proof record for metadata (filename, displayName, RIP) ---
              // This must happen regardless of how we find the email, because
              // email-prospects only stores the email, not proof metadata.
              try {
                const proofKeys = [`proof:${id}`, `proof:${id}.json`, id];
                for (const pk of proofKeys) {
                  try {
                    const proofRaw = await store.get(pk, { type: "text" });
                    if (proofRaw) {
                      const proofRecord = JSON.parse(proofRaw);
                      proofHash = proofHash || proofRecord.hash || null;
                      proofFilename = proofRecord.filename || proofFilename;
                      proofDisplayName = proofRecord.displayName || proofDisplayName;
                      proofCreatedAt = proofCreatedAt || proofRecord.createdAt || null;
                      proofRipPurchased = !!proofRecord.ripPurchased;
                      // Also grab email from proof record as a candidate
                      if (proofRecord.customerEmail) {
                        recipientEmail = proofRecord.customerEmail;
                      }
                      console.log(`resolve_cron: proof record found for ${id} via key "${pk}" — filename="${proofRecord.filename}", displayName="${proofRecord.displayName}", rip=${proofRecord.ripPurchased}`);
                      break;
                    }
                  } catch {}
                }
              } catch (proofErr) {
                console.log(`resolve_cron: proofs store lookup failed for ${id}:`, proofErr.message);
              }

              // --- Also try email-prospects store (may have email even if proof record didn't) ---
              if (!recipientEmail) {
                try {
                  const emailStore = await getEmailStore();
                  const emailRaw = await emailStore.get(`proof:${id}`, { type: "text" });
                  if (emailRaw) {
                    const emailRecord = JSON.parse(emailRaw);
                    recipientEmail = emailRecord.email;
                  }
                } catch (epErr) {
                  console.log(`resolve_cron: email-prospects lookup failed for ${id}:`, epErr.message);
                }
              }

              if (recipientEmail && process.env.POSTMARK_SERVER_TOKEN) {
                const verifyUrl = `https://docuproof.io/v/${id}`;
                const mempoolUrl = `https://mempool.space/block/${anchor.blockHeight}`;

                // --- Generate PDF certificate with all details ---
                let pdfB64 = null;
                try {
                  const pdfParams = new URLSearchParams({
                    id: id,
                    hash: proofHash || "",
                    displayName: proofDisplayName || "Document Proof",
                    filename: proofFilename || "document",
                    block: String(anchor.blockHeight),
                    blockHeight: String(anchor.blockHeight),
                    verifyUrl: verifyUrl,
                    createdAt: proofCreatedAt || anchor.createdAt || "",
                  });
                  if (proofRipPurchased) {
                    pdfParams.set("rip", "true");
                    console.log(`resolve_cron: RIP-enhanced certificate for ${id}`);
                  }
                  const pdfUrl = `${SITE_ORIGIN}/.netlify/functions/proof_pdf?${pdfParams.toString()}`;
                  const pdfResp = await fetch(pdfUrl, { method: "GET" });
                  if (pdfResp.ok) {
                    const pdfBuf = Buffer.from(await pdfResp.arrayBuffer());
                    pdfB64 = pdfBuf.toString("base64");
                    console.log(`resolve_cron: PDF certificate generated for ${id}`);
                  } else {
                    console.error(`resolve_cron: proof_pdf returned ${pdfResp.status} for ${id}`);
                  }
                } catch (pdfErr) {
                  console.error(`resolve_cron: PDF generation failed for ${id}:`, pdfErr);
                }

                // --- Build email with PDF attachment ---
                const emailPayload = {
                  From: process.env.POSTMARK_FROM || "docuProof <no-reply@docuproof.io>",
                  To: recipientEmail,
                  Subject: `✓ Proof ${id} is anchored — Block #${anchor.blockHeight}`, // unique per proof so Gmail doesn't group them
                  HtmlBody: `
                    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0d10; color: #e8eaed; padding: 32px; border-radius: 12px;">
                      <div style="text-align: center; margin-bottom: 24px;">
                        <h1 style="color: #22c55e; margin: 0;">docuProof</h1>
                        <p style="color: #8b949e; margin: 4px 0 0;">Proof you can point to.</p>
                      </div>
                      
                      <div style="background: #0d1912; border: 1px solid #1e5131; border-radius: 12px; padding: 20px; margin-bottom: 20px; text-align: center;">
                        <p style="font-size: 24px; margin: 0 0 8px;">&#x2705;</p>
                        <p style="color: #22c55e; font-size: 18px; font-weight: 700; margin: 0;">Your proof is permanently anchored</p>
                      </div>

                      <div style="background: #12161c; border: 1px solid #21262d; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
                        <p style="color: #8b949e; font-size: 13px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.1em;">Proof ID</p>
                        <p style="font-family: monospace; font-size: 16px; color: #22c55e; margin: 0 0 16px; word-break: break-all;">${id}</p>
                        <p style="color: #8b949e; font-size: 13px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.1em;">Blockchain Block</p>
                        <p style="font-size: 16px; color: #e8eaed; margin: 0;">#${anchor.blockHeight}</p>
                      </div>
                      
                      <p style="color: #c9d2db; line-height: 1.6;">
                        Your file's unique hash is now permanently recorded on the blockchain. 
                        It can never be altered or removed. Anyone can independently verify it existed at the moment you timestamped it.
                      </p>

                      ${pdfB64 ? '<p style="color: #c9d2db; line-height: 1.6;"><strong style="color: #e8eaed;">Your Certificate of Proof is attached as a PDF.</strong> This is your court-ready documentation — keep it with your original file.</p>' : ''}
                      ${pdfB64 && proofRipPurchased ? '<p style="color: #c9d2db; line-height: 1.6;">Your certificate includes <strong style="color: #22c55e;">RIP (Redundant Identity Preservation) Verified</strong> status, documenting that three identical copies of your file were cryptographically verified.</p>' : ''}
                      
                      <div style="text-align: center; margin: 24px 0;">
                        <a href="${mempoolUrl}" style="display: inline-block; background: #22c55e; color: #0a0d10; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 16px;">View Your Proof on the Blockchain</a>
                      </div>

                      <div style="text-align: center; margin: 12px 0 24px;">
                        <a href="${verifyUrl}" style="color: #22c55e; font-size: 13px; text-decoration: none;">View proof details on docuProof.io →</a>
                      </div>
                      
                      <div style="border-top: 1px solid #21262d; padding-top: 16px; margin-top: 24px; text-align: center;">
                        <p style="color: #6b7280; font-size: 13px; margin: 0;">
                          docuProof.io — Blockchain-anchored proof of existence
                        </p>
                      </div>
                    </div>
                  `,
                  TextBody: `Your proof is anchored!\n\nProof ID: ${id}\nBlockchain Block: #${anchor.blockHeight}\n\nYour file's unique hash is now permanently recorded on the blockchain.\n\n${pdfB64 ? 'Your Certificate of Proof is attached as a PDF.\n\n' : ''}View your proof: ${verifyUrl}\nView on Mempool: ${mempoolUrl}\n\ndocuProof.io — Proof you can point to.`,
                  MessageStream: "outbound",
                };

                // Attach PDF if generated
                if (pdfB64) {
                  const safeName = (proofFilename || "document").replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 50);
                  emailPayload.Attachments = [{
                    Name: `${safeName}-docuProof-Certificate.pdf`,
                    Content: pdfB64,
                    ContentType: "application/pdf",
                  }];
                }

                await fetch("https://api.postmarkapp.com/email", {
                  method: "POST",
                  headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-Postmark-Server-Token": process.env.POSTMARK_SERVER_TOKEN,
                  },
                  body: JSON.stringify(emailPayload),
                });
                console.log(`resolve_cron: anchored email${pdfB64 ? ' + certificate' : ''} sent to ${recipientEmail} for ${id}`);
              }
            } catch (emailErr) {
              console.error(`resolve_cron: failed to send anchored email for ${id}:`, emailErr);
              // Don't fail the upgrade if email fails
            }
          }
        }

        processed++;
      } catch (itemErr) {
        console.error(`resolve_cron: error processing ${anchorKey}:`, itemErr);
        errors++;
        processed++;
      }
    }

    // ─── Monitoring: sidecar down? ───────────────────────────────────
    if (upgradeCalls >= 2 && upgradeFailures === upgradeCalls) {
      const last = await store.get("alert:sidecar-last", { type: "text" }).catch(() => null);
      if (!last || Date.now() - Date.parse(last) > SIDECAR_ALERT_EVERY_MS) {
        await store.set("alert:sidecar-last", new Date().toISOString()).catch(() => {});
        alerts.push({ title: "Anchoring service (OTS sidecar) is not responding", detail: `All ${upgradeCalls} checks this hour failed. Proofs will wait until it recovers.` });
      }
    }

    // ─── Monitoring: send one alert email if anything went wrong ─────
    if (alerts.length) {
      const rows = alerts.map((a) => `<li style="margin-bottom:10px"><strong>${a.title}</strong>${a.id ? `<br>Proof <a href="https://docuproof.io/v/${a.id}">${a.id}</a>` : ""}<br><span style="color:#666">${a.detail || ""}</span></li>`).join("");
      const text = alerts.map((a) => `- ${a.title}${a.id ? ` (proof ${a.id})` : ""}: ${a.detail || ""}`).join("\n");
      await sendOwnerEmail(
        `⚠️ docuProof alert: ${alerts.length} issue${alerts.length > 1 ? "s need" : " needs"} attention`,
        `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5"><p>The hourly anchoring check found:</p><ul>${rows}</ul><p>The system keeps retrying automatically every hour. Forward this email to Claude to investigate.</p></div>`,
        `The hourly anchoring check found:\n${text}\n\nThe system keeps retrying automatically every hour. Forward this email to Claude to investigate.`
      );
    }

    // ─── Monitoring: Monday "all clear" summary (proves the monitor is alive) ──
    const now = new Date();
    if (now.getUTCDay() === 1 && now.getUTCHours() === 14) {
      const weekKey = `report-${now.toISOString().slice(0, 10)}`;
      if (await claimAlert(store, weekKey)) {
        const stuckNow = stuckCandidates.length;
        await sendOwnerEmail(
          `docuProof weekly check: ${anchoredLast7d} anchored, ${stuckNow ? stuckNow + " stuck" : "no problems"}`,
          `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5"><p><strong>docuProof anchoring — last 7 days</strong></p><ul><li>Proofs anchored: ${anchoredLast7d}</li><li>Waiting right now: ${pendingList.length}</li><li>Older than 12h and not anchored: ${stuckNow}</li><li>Repaired automatically this hour: ${healed}</li></ul><p>You'll get a separate alert email whenever a customer proof has a problem. If you stop receiving this Monday summary, the hourly check itself has stopped — tell Claude.</p></div>`,
          `docuProof anchoring — last 7 days\nAnchored: ${anchoredLast7d}\nWaiting now: ${pendingList.length}\nOlder than 12h, not anchored: ${stuckNow}\nRepaired this hour: ${healed}\n\nIf you stop receiving this Monday summary, the hourly check has stopped — tell Claude.`
        );
      }
    }

    return json(200, {
      ok: true,
      alerts: alerts.length,
      processed,
      upgraded,
      skipped,
      errors,
      total: anchorKeys.length,
      alreadyAnchored,
      pending: pendingList.length,
      batch: batch.length,
      stoppedForTime,
      healed,
      healErrors,
      ms: Date.now() - startedAt,
    });
  } catch (e) {
    console.error("resolve_cron error:", e);
    return json(500, { ok: false, error: e.message });
  }
};
