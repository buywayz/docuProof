// netlify/functions/create_free_proof.js
// Creates a FREE proof that goes through the SAME blockchain anchoring as paid proofs
// The difference from paid: no email notifications, no PDF certificate delivery
// But the proof IS anchored to Bitcoin via OpenTimestamps

const { getStore } = require("@netlify/blobs");

// Generate a short unique ID for quick verification (same as paid proofs)
function generateQuickId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // No confusing chars (0,o,1,l,i)
  let id = '';
  for (let i = 0; i < 10; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Generate proof ID (matches paid proof format)
function generateProofId() {
  return 'free_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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
    const { hash, filename, source } = body;

    // Validate hash
    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: false, error: 'Invalid hash. Must be 64 hex characters.' })
      };
    }

    // Generate IDs
    const proofId = generateProofId();
    const quickId = generateQuickId();
    const now = new Date();

    // Create proof record - SAME structure as paid proofs so it goes through anchoring
    const proof = {
      id: proofId,
      quickId: quickId,
      hash: hash.toLowerCase(),
      filename: (filename || '').slice(0, 255) || null,
      source: source || 'free-trial',
      type: 'free',
      
      // IMPORTANT: Status is 'pending' so it gets picked up by the anchoring batch job
      status: 'pending',
      anchorStatus: 'pending',
      
      createdAt: now.toISOString(),
      
      // No email for free proofs (user didn't provide one)
      email: null,
      
      // Metadata
      ip: event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
      userAgent: (event.headers['user-agent'] || '').slice(0, 500)
    };

    // Store in Netlify Blobs - same store as paid proofs
    const store = getStore({
      name: 'proofs',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });

    // Save by proof ID
    await store.setJSON(proofId, proof);
    console.log(`Free proof created (pending anchor): ${proofId}`);

    // Also save quick ID mapping (same as paid)
    const quickStore = getStore({
      name: 'quick-ids',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });
    await quickStore.set(quickId, proofId);
    console.log(`Quick ID mapped: ${quickId} -> ${proofId}`);

    // Return success - proof will be anchored in next batch
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        proofId: proofId,
        quickId: quickId,
        hash: proof.hash,
        filename: proof.filename,
        createdAt: proof.createdAt,
        verifyUrl: `https://docuproof.io/v/${quickId}`,
        status: 'pending',
        message: 'Your proof has been created and queued for blockchain anchoring.',
        note: 'Anchoring typically completes within a few hours. Check your verification link for status updates.'
      })
    };

  } catch (err) {
    console.error('Error creating free proof:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Failed to create proof. Please try again.' })
    };
  }
};
