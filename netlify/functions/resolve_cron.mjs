// netlify/functions/resolve_cron.mjs
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
const BATCH_LIMIT = 40;

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

    if (anchorKeys.length === 0) {
      return json(200, { ok: true, processed: 0, note: "no anchor records found" });
    }

    // ─── Step 2: Process each pending anchor ────────────────────────────
    const batch = anchorKeys.slice(0, BATCH_LIMIT);
    let processed = 0;
    let skipped = 0;
    let upgraded = 0;
    let errors = 0;

    for (const anchorKey of batch) {
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
          // No receipt found - can't upgrade
          processed++;
          continue;
        }

        const receiptB64 = receiptBytes.toString("base64");

        // ─── Step 4: Call sidecar /upgrade ────────────────────────────
        let upgradeResult = null;
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
                  Subject: `✓ Your proof is anchored — Bitcoin Block #${anchor.blockHeight}`,
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
                        <p style="color: #8b949e; font-size: 13px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.1em;">Bitcoin Block</p>
                        <p style="font-size: 16px; color: #e8eaed; margin: 0;">#${anchor.blockHeight}</p>
                      </div>
                      
                      <p style="color: #c9d2db; line-height: 1.6;">
                        Your file's unique hash is now permanently recorded on the Bitcoin blockchain. 
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
                          docuProof.io — Bitcoin-anchored proof of existence
                        </p>
                      </div>
                    </div>
                  `,
                  TextBody: `Your proof is anchored!\n\nProof ID: ${id}\nBitcoin Block: #${anchor.blockHeight}\n\nYour file's unique hash is now permanently recorded on the Bitcoin blockchain.\n\n${pdfB64 ? 'Your Certificate of Proof is attached as a PDF.\n\n' : ''}View your proof: ${verifyUrl}\nView on Mempool: ${mempoolUrl}\n\ndocuProof.io — Proof you can point to.`,
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

    return json(200, {
      ok: true,
      processed,
      upgraded,
      skipped,
      errors,
      total: anchorKeys.length,
      batch: batch.length,
    });
  } catch (e) {
    console.error("resolve_cron error:", e);
    return json(500, { ok: false, error: e.message });
  }
};
