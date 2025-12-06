import base64
import json
import os
from flask import Blueprint, request, jsonify
from opentimestamps.client import upgrade_timestamp
from opentimestamps.core.op import Op
from opentimestamps.core.timestamp import Timestamp

bp = Blueprint('upgrade', __name__)

# Utility: extract txid from upgraded attestation structure
def extract_txid(ts: Timestamp):
    """
    OpenTimestamps attestations represent Bitcoin anchoring like:
    PendingAttestation('url')
    BitcoinAttestation(txid)

    We look for attestation classes with a txid attribute.
    """
    for att in ts.attestations:
        # Opcodes with txid property
        txid = getattr(att, 'txid', None)
        if txid:
            return txid
    return None

@bp.route('/upgrade', methods=['POST'])
def upgrade():
    data = request.get_json(silent=True) or {}
    proof_id = data.get("id")

    if not proof_id:
        return jsonify({"ok": False, "error": "Missing id"}), 400

    # Where we store receipts locally (sidecar cache)
    receipts_dir = "/app/receipts"
    os.makedirs(receipts_dir, exist_ok=True)

    receipt_path = os.path.join(receipts_dir, f"{proof_id}.ots")

    if not os.path.exists(receipt_path):
        return jsonify({"ok": False, "error": "Receipt not found in sidecar"}), 404

    # Load receipt
    with open(receipt_path, "rb") as f:
        ts = Timestamp.deserialize(f.read())

    # Try upgrading
    try:
        upgrade_timestamp(ts)
    except Exception as e:
        return jsonify({"ok": False, "error": "Upgrade failed", "detail": str(e)}), 500

    # Save upgraded copy
    with open(receipt_path, "wb") as f:
        f.write(ts.serialize())

    txid = extract_txid(ts)

    return jsonify({
        "ok": True,
        "id": proof_id,
        "txid": txid,
        "confirmations": 0,
        "receipt_b64": base64.b64encode(ts.serialize()).decode()
    })
