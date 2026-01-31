// netlify/functions/create_free_proof.js
// v2.0.0 - Creates a FREE proof using the SAME anchoring system as paid proofs
// Integrates with _db.js and submit_proof.js for proper blockchain anchoring

const { saveProof, appendToFeeds, saveAnchorStatus } = require("./_db");

// Generate a unique proof ID for free proofs
function generateProofId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `free_${timestamp}${random}`;
}

// Validate SHA-256 hash format
function isValidSHA256(hash) {
  return typeof hash === 'string' && /^[0-9a-fA-F]{64}$/i.test(hash);
}

// Sanitize filename
function sanitizeFilename(str, maxLength = 255) {
  if (!str || typeof str !== 'string') return 'document';
  return str
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\.\./g, '')
    .trim()
    .slice(0, maxLength) || 'document';
}

// Get site origin for calling other functions
function getSiteOrigin() {
  return process.env.URL || "https://docuproof.io";
}

exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { hash, filename, displayName, source } = body;

    // Validate hash
    if (!hash || !isValidSHA256(hash)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ok: false, 
          error: 'Invalid hash. Must be a 64-character hexadecimal SHA-256 hash.' 
        })
      };
    }

    // Generate proof ID
    const proofId = generateProofId();
    const now = new Date();
    const sanitizedFilename = sanitizeFilename(filename);
    const sanitizedDisplayName = sanitizeFilename(displayName) || sanitizedFilename;

    // Create proof record using the same structure as paid proofs
    const proofRecord = {
      id: proofId,
      hash: hash.toLowerCase(),
      filename: sanitizedFilename,
      displayName: sanitizedDisplayName,
      customerEmail: null, // No email for free proofs
      createdAt: now.toISOString(),
      source: source || 'free_proof',
      type: 'free',
      version: 2,
    };

    // Save proof record (same as paid proofs)
    await saveProof(proofRecord);
    console.log(`Free proof record saved: ${proofId}`);

    // Add to feeds (same as paid proofs)
    await appendToFeeds(proofRecord);
    console.log(`Free proof added to feeds: ${proofId}`);

    // Create initial anchor status (PENDING)
    await saveAnchorStatus({
      id: proofId,
      state: 'PENDING',
      hash: hash.toLowerCase(),
      createdAt: now.toISOString(),
      source: 'free_proof',
    });
    console.log(`Free proof anchor status created: ${proofId}`);

    // Submit to OpenTimestamps for anchoring (same flow as paid proofs)
    const origin = getSiteOrigin();
    const submitUrl = `${origin}/.netlify/functions/submit_proof`;
    
    const submitBody = {
      id: proofId,
      hash: hash.toLowerCase(),
      filename: sanitizedFilename,
      displayName: sanitizedDisplayName,
      customerEmail: null,
      source: 'free_proof',
    };

    console.log(`Submitting free proof for anchoring: ${proofId}`);
    
    // Fire and forget - don't wait for anchoring to complete
    fetch(submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitBody),
    }).then(res => {
      if (res.ok) {
        console.log(`Free proof submitted for anchoring: ${proofId}`);
      } else {
        console.error(`Free proof anchoring submission failed: ${proofId} - ${res.status}`);
      }
    }).catch(err => {
      console.error(`Free proof anchoring submission error: ${proofId}`, err);
    });

    // Build verification URL
    const verifyUrl = `${origin}/v/${proofId}`;

    // Return success response
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({
        ok: true,
        proofId: proofId,
        hash: hash.toLowerCase(),
        filename: sanitizedFilename,
        displayName: sanitizedDisplayName,
        createdAt: proofRecord.createdAt,
        verifyUrl: verifyUrl,
        status: 'pending',
        message: 'Your free proof has been created and queued for blockchain anchoring.',
        note: 'Anchoring typically takes 1-3 hours. Check your verification link for status updates.'
      })
    };

  } catch (err) {
    console.error('Error creating free proof:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ok: false, 
        error: 'Failed to create proof. Please try again.' 
      })
    };
  }
};
