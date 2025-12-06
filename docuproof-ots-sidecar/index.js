const express = require('express');
const morgan = require('morgan');
const OpenTimestamps = require('opentimestamps');

const { DetachedTimestampFile, Ops } = OpenTimestamps;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(morgan('combined'));

function validateHex64(hash) {
  return typeof hash === 'string' && /^[0-9a-fA-F]{64}$/.test(hash);
}

function error(res, status, msg, detail) {
  const body = { ok: false, error: msg };
  if (detail) body.detail = detail;
  return res.status(status).json(body);
}

// Health check
app.get('/', (req, res) => {
  res.json({ ok: true, service: 'docuProof OTS sidecar' });
});

// /stamp-hash
app.post('/stamp-hash', async (req, res) => {
  const { id, hash } = req.body || {};

  if (!id || typeof id !== 'string' || !id.trim()) {
    return error(res, 400, 'Invalid or missing id');
  }
  if (!validateHex64(hash)) {
    return error(res, 400, 'Invalid or missing hash');
  }

  try {
    const hashBuf = Buffer.from(hash, 'hex');

    const detached = DetachedTimestampFile.fromHash(
      new Ops.OpSHA256(),
      hashBuf
    );

    await OpenTimestamps.stamp(detached);

    const otsBytes = detached.serializeToBytes();
    const receiptB64 = Buffer.from(otsBytes).toString('base64');

    return res.json({
      ok: true,
      id,
      receipt_b64: receiptB64,
      info: { hash, size: otsBytes.length },
    });
  } catch (e) {
    console.error('stamp-hash error:', e);
    return error(res, 502, 'OTS stamp failed', String(e.message || e));
  }
});

// /upgrade
app.post('/upgrade', async (req, res) => {
  const { id, receipt_b64 } = req.body || {};

  if (!id || typeof id !== 'string' || !id.trim()) {
    return error(res, 400, 'Invalid or missing id');
  }
  if (!receipt_b64 || typeof receipt_b64 !== 'string') {
    return error(res, 400, 'Invalid or missing receipt_b64');
  }

  let otsBytes;
  try {
    otsBytes = Buffer.from(receipt_b64, 'base64');
    if (!otsBytes.length) {
      return error(res, 400, 'receipt_b64 decoded to empty bytes');
    }
  } catch (e) {
    return error(res, 400, 'receipt_b64 is not valid base64', String(e.message));
  }

  try {
    const detached = DetachedTimestampFile.deserialize(otsBytes);

    // Ask calendars for any upgrades
    const changed = await OpenTimestamps.upgrade(detached);

    // Serialize upgraded receipt
    const upgradedBytes = detached.serializeToBytes();
    const upgradedB64 = Buffer.from(upgradedBytes).toString('base64');

    // Human-readable info (contains "# transaction id ..." lines)
    const infoText = OpenTimestamps.info(detached) || '';

    // --- KEY FIX: robust txid extraction ---
    //
    // OpenTimestamps JS prints lines like:
    //   "# transaction id 3cd112ba6b40..."
    //
    // Older CLIs sometimes used:
    //   "Bitcoin transaction id <txid>"
    //
    // We match both.
    let txid = null;
    let state = 'OTS_RECEIPT';

    if (typeof infoText === 'string') {
      const txMatch = infoText.match(
        /(?:#\s*transaction id|Bitcoin transaction id)\s+([0-9a-fA-F]{64})/
      );
      if (txMatch) {
        txid = txMatch[1].toLowerCase();
        state = 'ANCHORED';
      } else if (!changed) {
        // No changes from upgrade() and still no txid => still pending
        state = 'PENDING';
      }
    }

    const response = {
      ok: true,
      id,
      state,
      receipt_b64: upgradedB64,
      info: { raw_info: infoText },
    };

    if (txid) {
      response.txid = txid;
    }

    return res.json(response);
  } catch (e) {
    console.error('upgrade error:', e);
    return error(res, 502, 'OTS upgrade failed', String(e.message || e));
  }
});

// Fallback error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  return error(res, 500, 'Internal server error');
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`docuProof OTS sidecar listening on port ${port}`);
});
