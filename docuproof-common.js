// docuproof-common.js - Shared functionality for all docuProof pages
// Version 1.1.0

// ========== SHA-256 Hash Function ==========
async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ========== Custom Modal (replaces confirm() to preserve user gesture chain) ==========
function showDocuModal(opts) {
  // opts: { icon, title, message, confirmText, cancelText, onConfirm, onCancel }
  var overlay = document.createElement('div');
  overlay.id = 'docuModal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10001;font-family:inherit;';

  var box = document.createElement('div');
  box.style.cssText = 'background:#1a1f24;border:1px solid #21262d;border-radius:16px;padding:32px 28px;max-width:420px;width:90%;text-align:center;color:#e8eaed;';

  box.innerHTML =
    '<div style="font-size:40px;margin-bottom:14px;">' + (opts.icon || '') + '</div>' +
    '<div style="font-size:18px;font-weight:700;margin-bottom:10px;line-height:1.3;">' + (opts.title || '') + '</div>' +
    '<div style="font-size:14px;color:#8b949e;margin-bottom:24px;line-height:1.6;">' + (opts.message || '') + '</div>' +
    '<div style="display:flex;gap:12px;justify-content:center;">' +
      '<button id="docuModalCancel" style="padding:12px 24px;border-radius:10px;border:1px solid #21262d;background:#12161c;color:#8b949e;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">' + (opts.cancelText || 'Cancel') + '</button>' +
      '<button id="docuModalConfirm" style="padding:12px 24px;border-radius:10px;border:none;background:#22c55e;color:#0a0d10;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">' + (opts.confirmText || 'Continue') + '</button>' +
    '</div>';

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  document.getElementById('docuModalConfirm').addEventListener('click', function() {
    overlay.remove();
    if (opts.onConfirm) opts.onConfirm();
  });

  document.getElementById('docuModalCancel').addEventListener('click', function() {
    overlay.remove();
    if (opts.onCancel) opts.onCancel();
  });

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) {
      overlay.remove();
      if (opts.onCancel) opts.onCancel();
    }
  });
}

// ========== Camera Functions ==========
function openCamera(type) {
  var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (!isMobile) {
    // Use custom modal — the confirm button click IS the user gesture
    // so the file input opens immediately and reliably
    showDocuModal({
      icon: '📱',
      title: 'This works best on mobile',
      message: 'On mobile, this opens your camera directly.<br>On desktop, you can still select a photo from your files.',
      confirmText: 'Select a Photo',
      cancelText: 'Cancel',
      onConfirm: function() {
        _openCameraInput(type);
      }
    });
  } else {
    _openCameraInput(type);
  }
}

function _openCameraInput(type) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = type === 'selfie' ? 'user' : 'environment';

  input.onchange = function(e) {
    var file = e.target.files[0];
    if (file) {
      _confirmAndTimestamp(file, type);
    }
  };

  input.click();
}

// ========== Free Proof Functions ==========
function openFreeProof(source) {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = source === 'screenshot' ? 'image/*' : '*/*';

  input.onchange = function(e) {
    var file = e.target.files[0];
    if (file) {
      _confirmAndTimestamp(file, source);
    }
  };

  input.click();
}

// ========== Confirm Before Timestamping ==========
function _confirmAndTimestamp(file, source) {
  showDocuModal({
    icon: '📌',
    title: 'Timestamp this file?',
    message: '<strong style="color:#e8eaed;">' + file.name + '</strong><br><br>A unique hash of this file will be anchored to the blockchain. Your file never leaves your device — only the hash is recorded.<br><br>This is free. No account needed.',
    confirmText: 'Timestamp It →',
    cancelText: 'Cancel',
    onConfirm: function() {
      // Pre-open new tab NOW during this click = valid user gesture
      var newTab = window.open('about:blank', '_blank');
      _runFreeProof(file, source, newTab);
    }
  });
}

async function _runFreeProof(file, source, newTab) {
  // Write a loading message into the pre-opened tab
  if (newTab && !newTab.closed) {
    try {
      newTab.document.title = 'Timestamping... \u2022 docuProof';
      newTab.document.body.style.cssText = 'background:#0a0d10;color:#e8eaed;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;';
      newTab.document.body.innerHTML = '<div style="text-align:center;"><div style="font-size:48px;margin-bottom:16px;">\u23f3</div><div style="font-size:18px;font-weight:700;">Timestamping your file...</div><div style="font-size:14px;color:#8b949e;margin-top:8px;">Creating hash and anchoring to the blockchain</div></div>';
    } catch(e) { /* cross-origin safety */ }
  }

  // Show loading overlay on the original page too
  var overlay = document.createElement('div');
  overlay.id = 'freeProofLoading';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10000;color:#fff;font-family:inherit;';
  overlay.innerHTML = '<div style="font-size:48px;margin-bottom:20px;">\u23f3</div><div style="font-size:20px;font-weight:700;margin-bottom:8px;">Timestamping your file...</div><div style="font-size:14px;color:#8b949e;">Creating hash and anchoring to the blockchain</div>';
  document.body.appendChild(overlay);

  try {
    var hash = await sha256Hex(file);

    var response = await fetch('/.netlify/functions/create_free_proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hash: hash,
        filename: file.name,
        source: source
      })
    });

    var data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Failed to create proof');
    }

    // Remove loading overlay from original page
    overlay.remove();

    // Navigate the pre-opened tab to the verify URL
    if (newTab && !newTab.closed) {
      newTab.location.href = data.verifyUrl;
    } else {
      // Fallback: popup was blocked
      _showProofLink(data.verifyUrl);
    }

  } catch (err) {
    overlay.remove();
    if (newTab && !newTab.closed) {
      newTab.close();
    }
    alert('Error: ' + err.message);
  }
}

function _showProofLink(url) {
  var linkOverlay = document.createElement('div');
  linkOverlay.id = 'freeProofLink';
  linkOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10000;color:#fff;font-family:inherit;';
  linkOverlay.innerHTML =
    '<div style="font-size:48px;margin-bottom:20px;">\u2705</div>' +
    '<div style="font-size:20px;font-weight:700;margin-bottom:6px;">Your file has been submitted for timestamping!</div>' +
    '<div style="font-size:14px;color:#8b949e;margin-bottom:20px;">It will be anchored to the blockchain within 1\u20133 hours.</div>' +
    '<a href="' + url + '" target="_blank" style="display:inline-block;padding:14px 32px;background:#22c55e;color:#0a0d10;border-radius:10px;text-decoration:none;font-size:16px;font-weight:700;">View Your Proof \u2192</a>' +
    '<div style="font-size:13px;color:#8b949e;margin-top:16px;cursor:pointer;" onclick="this.parentElement.remove()">Close</div>';
  document.body.appendChild(linkOverlay);
}

// ========== Modal Functions ==========
function closeFreeProofModal() {
  var modal = document.getElementById('freeProofModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ========== FAQ Accordion ==========
function initFaqAccordion() {
  document.querySelectorAll('.faq-q').forEach(function(question) {
    question.addEventListener('click', function() {
      var item = this.parentElement;
      document.querySelectorAll('.faq-item').forEach(function(other) {
        if (other !== item) {
          other.classList.remove('open');
        }
      });
      item.classList.toggle('open');
    });
  });
}

// ========== Year Footer ==========
function initYear() {
  var yrEl = document.getElementById('yr');
  if (yrEl) {
    yrEl.textContent = new Date().getFullYear();
  }
}

// ========== Initialize Everything on DOM Ready ==========
document.addEventListener('DOMContentLoaded', function() {
  initYear();
  initFaqAccordion();
});
