const express = require('express');
const OpenTimestamps = require('javascript-opentimestamps');

const app = express();
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ots-sidecar',
    version: '3.0.0',
    endpoints: ['/stamp-hash', '/upgrade-receipt']
  });
});

// ========== STAMP A HASH ==========
app.post('/stamp-hash', async (req, res) => {
  try {
    const { id, hash } = req.body;
    
    if (!hash || typeof hash !== 'string') {
      return res.status(400).json({ ok: false, error: 'hash parameter required' });
    }
    
    if (!/^[0-9a-fA-F]{64}$/.test(hash)) {
      return res.status(400).json({ ok: false, error: 'Invalid hash format - must be 64 hex characters' });
    }
    
    console.log(`Stamping hash: ${hash.slice(0, 16)}... for id: ${id || 'unknown'}`);
    
    const hashBytes = Buffer.from(hash, 'hex');
    const detached = OpenTimestamps.DetachedTimestampFile.fromHash(
      new OpenTimestamps.Ops.OpSHA256(),
      hashBytes
    );
    
    console.log('Submitting to OTS calendar servers...');
    await OpenTimestamps.stamp(detached);
    console.log('Stamp submitted successfully');
    
    const receiptBytes = detached.serializeToBytes();
    const receipt_b64 = Buffer.from(receiptBytes).toString('base64');
    
    console.log(`Receipt created: ${receiptBytes.length} bytes`);
    
    res.json({ 
      ok: true, 
      receipt_b64,
      receipt_size: receiptBytes.length,
      id: id || null
    });
    
  } catch (err) {
    console.error('Error stamping hash:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========== UPGRADE RECEIPT ==========
app.post('/upgrade-receipt', async (req, res) => {
  try {
    const { receiptBase64 } = req.body;
    
    if (!receiptBase64) {
      return res.status(400).json({ ok: false, error: 'receiptBase64 required' });
    }
    
    console.log(`Upgrading receipt (${receiptBase64.length} chars base64)...`);
    
    const receiptBuffer = Buffer.from(receiptBase64, 'base64');
    
    let detached;
    try {
      detached = OpenTimestamps.DetachedTimestampFile.deserialize(receiptBuffer);
      console.log('Receipt deserialized successfully');
    } catch (deserErr) {
      console.error('Deserialize error:', deserErr);
      return res.status(400).json({ ok: false, error: `Invalid receipt format: ${deserErr.message}` });
    }
    
    // Try to upgrade - this is the ONLY way to get Bitcoin attestation
    let upgraded = false;
    try {
      console.log('Attempting upgrade via calendar servers...');
      const changed = await OpenTimestamps.upgrade(detached);
      upgraded = !!changed;
      console.log('Upgrade result:', upgraded ? 'UPGRADED!' : 'no change (pending)');
    } catch (upgradeErr) {
      console.log('Upgrade not ready:', upgradeErr.message);
    }
    
    // Walk the timestamp tree to find Bitcoin block attestation
    // This is the ONLY reliable way to know if it's truly anchored
    let blockHeight = null;
    
    function findBitcoinAttestation(timestamp, depth = 0) {
      if (!timestamp) return;
      
      const indent = '  '.repeat(depth);
      
      // Check attestations at this level
      if (timestamp.attestations) {
        console.log(`${indent}Found attestations (type: ${typeof timestamp.attestations}, size: ${timestamp.attestations.size || 'N/A'})`);
        
        // Try different iteration methods
        if (typeof timestamp.attestations.forEach === 'function') {
          timestamp.attestations.forEach((attestation, key) => {
            console.log(`${indent}  Attestation: ${attestation?.constructor?.name || typeof attestation}`);
            if (attestation && attestation.height !== undefined) {
              console.log(`${indent}    Has height: ${attestation.height}`);
              blockHeight = attestation.height;
            }
          });
        } else if (Array.isArray(timestamp.attestations)) {
          timestamp.attestations.forEach((attestation) => {
            console.log(`${indent}  Attestation (array): ${attestation?.constructor?.name || typeof attestation}`);
            if (attestation && attestation.height !== undefined) {
              blockHeight = attestation.height;
            }
          });
        } else {
          console.log(`${indent}  Attestations keys: ${Object.keys(timestamp.attestations)}`);
        }
      }
      
      // Recurse into ops
      if (timestamp.ops) {
        console.log(`${indent}Found ops (type: ${typeof timestamp.ops}, size: ${timestamp.ops.size || 'N/A'})`);
        
        if (typeof timestamp.ops.forEach === 'function') {
          timestamp.ops.forEach((nextTimestamp, key) => {
            findBitcoinAttestation(nextTimestamp, depth + 1);
          });
        } else if (Array.isArray(timestamp.ops)) {
          timestamp.ops.forEach((nextTimestamp) => {
            findBitcoinAttestation(nextTimestamp, depth + 1);
          });
        }
      }
    }
    
    if (detached && detached.timestamp) {
      findBitcoinAttestation(detached.timestamp);
    }
    
    // Only consider it anchored if we found a block height
    const isAnchored = blockHeight !== null;
    
    // Get confirmations if anchored
    let confirmations = 0;
    let txid = null;
    
    if (isAnchored && blockHeight) {
      try {
        // Get current block height
        const tipRes = await fetch('https://mempool.space/api/blocks/tip/height');
        if (tipRes.ok) {
          const currentHeight = parseInt(await tipRes.text());
          confirmations = Math.max(0, currentHeight - blockHeight + 1);
          console.log(`Confirmations: ${confirmations} (current: ${currentHeight}, anchored: ${blockHeight})`);
        }
        
        // Try to get the txid from the block
        // The txid is embedded in the attestation path, but extracting it reliably
        // requires walking the merkle path. For now, we can get it from mempool API
        // by looking for OP_RETURN transactions in that block with OTS marker
        // This is complex, so we'll leave txid as null and let the verify page
        // show "anchored at block X" instead
        
      } catch (e) {
        console.error('Error getting confirmations:', e);
      }
    }
    
    // Serialize the (possibly upgraded) receipt
    let newReceipt_b64 = receiptBase64;
    try {
      const newReceiptBytes = detached.serializeToBytes();
      newReceipt_b64 = Buffer.from(newReceiptBytes).toString('base64');
    } catch (serErr) {
      console.error('Serialize error:', serErr);
    }
    
    const result = {
      ok: true,
      upgraded,
      anchored: isAnchored,
      blockHeight,
      confirmations,
      txid, // Will be null - we're not extracting fake txids anymore
      receipt_b64: newReceipt_b64
    };
    
    console.log('Result:', JSON.stringify({ ...result, receipt_b64: '(omitted)' }));
    res.json(result);
    
  } catch (err) {
    console.error('Error upgrading receipt:', err);
    res.status(500).json({ ok: false, error: err.message, stack: err.stack });
  }
});

// Debug endpoint
app.get('/debug', (req, res) => {
  res.json({
    version: '3.0.0',
    otsKeys: Object.keys(OpenTimestamps),
    note: 'This version only reports anchored=true when Bitcoin block attestation is found'
  });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`OTS Sidecar v3.0.0 listening on port ${PORT}`);
});
