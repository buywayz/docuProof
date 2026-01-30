// netlify/functions/create_free_proof.js
// Creates a free proof without requiring payment
// Used for "Try It Free" section on landing pages

const { getStore } = require("@netlify/blobs");

// Generate a short unique ID for quick verification
function generateQuickId() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // No confusing chars (0,o,1,l,i)
  let id = '';
  for (let i = 0; i < 10; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// Generate a longer proof ID
function generateProofId() {
  return 'fp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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

    // Create proof record
    const proof = {
      id: proofId,
      quickId: quickId,
      hash: hash.toLowerCase(),
      filename: (filename || '').slice(0, 255) || null,
      source: source || 'free',
      type: 'free',
      status: 'confirmed', // Free proofs are immediately confirmed
      createdAt: now.toISOString(),
      
      // Free proofs don't have blockchain anchoring
      // They're just stored in our database as proof of submission time
      anchorStatus: 'not_anchored',
      anchorNote: 'Free proofs are stored in docuProof database. Upgrade for blockchain anchoring.',
      
      // Metadata
      ip: event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
      userAgent: (event.headers['user-agent'] || '').slice(0, 500)
    };

    // Store in Netlify Blobs
    const store = getStore({
      name: 'proofs',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });

    // Save by proof ID
    await store.setJSON(proofId, proof);
    console.log(`Free proof created: ${proofId}`);

    // Also save quick ID mapping
    const quickStore = getStore({
      name: 'quick-ids',
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_BLOBS_TOKEN,
    });
    await quickStore.set(quickId, proofId);
    console.log(`Quick ID mapped: ${quickId} -> ${proofId}`);

    // Return success with verification URL
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
        type: 'free',
        message: 'Free proof created! Your file hash has been recorded with a timestamp.',
        upgradeNote: 'Want blockchain-anchored proof? Upgrade to a paid plan for permanent, independently verifiable timestamps.'
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
