from flask import Flask, request, jsonify
import base64
import subprocess
import tempfile
import os
import re
import shlex

app = Flask(__name__)

def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")

@app.get("/")
def index():
    return jsonify({"ok": True, "service": "docuProof OTS sidecar"})

@app.get("/healthz")
def healthz():
    return jsonify({"ok": True})

@app.post("/submit")
def submit():
    """
    Body: { "hash": "<64-char sha256 hex (lowercase)>" }
    Returns: { ok: true, receipt_b64: "<base64>" }
    Notes:
      - We stamp the *raw* 32-byte digest, not the file itself.
      - We upgrade in-place (no -o) for maximum compatibility.
    """
    j = request.get_json(force=True, silent=True) or {}
    h = (j.get("hash") or "").strip().lower()

    # Validate SHA-256 as 64 lowercase hex chars
    if not re.fullmatch(r"[0-9a-f]{64}", h or ""):
        return jsonify({"error": "hash must be 64-char sha256 hex"}), 400

    with tempfile.TemporaryDirectory() as tmpd:
        data_path = os.path.join(tmpd, "hash.bin")  # raw 32-byte digest
        req_path  = os.path.join(tmpd, "req.ots")

        # 1) Write the raw digest bytes to file from hex
        p0 = subprocess.run(
            ["bash", "-lc", f"echo -n {shlex.quote(h)} | xxd -r -p > {shlex.quote(data_path)}"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        if p0.returncode != 0:
            return jsonify({"error": "prepare-bytes failed", "stderr": p0.stderr.decode()}), 500

        # 2) Stamp (produces hash.bin.ots)
        p1 = subprocess.run(
            ["bash", "-lc", f"ots stamp {shlex.quote(data_path)}"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        if p1.returncode != 0:
            return jsonify({"error": "stamp failed", "stderr": p1.stderr.decode()}), 500

        # Rename request to canonical req.ots
        pmv = subprocess.run(
            ["bash", "-lc", f"mv {shlex.quote(data_path)}.ots {shlex.quote(req_path)}"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        if pmv.returncode != 0:
            return jsonify({"error": "rename request failed", "stderr": pmv.stderr.decode()}), 500

        # 3) Upgrade in place (no -o). This may report "pending confirmation" — that’s OK.
        p2 = subprocess.run(
            ["bash", "-lc", f"ots upgrade {shlex.quote(req_path)}"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )
        # Some OTS builds return nonzero even when calendars are just pending.
        # If upgrade produced a file, we’ll still try to return it.
        if p2.returncode != 0:
            # As long as req_path exists, proceed; otherwise surface error.
            if not os.path.exists(req_path):
                return jsonify({"error": "calendar submit failed", "stderr": p2.stderr.decode()}), 502

        # Read the (possibly partially-upgraded) receipt. This is the right artifact to store.
        with open(req_path, "rb") as f:
            receipt = f.read()

    return jsonify({
        "ok": True,
        "receipt_b64": _b64(receipt)
    })