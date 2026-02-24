// docuproof-common.js - Shared functionality for all docuProof pages
// Version 1.0.0

// ========== SHA-256 Hash Function ==========
async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ========== Camera Functions ==========
function openCamera(type) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = type === 'selfie' ? 'user' : 'environment';
  
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
      openFreeProofWithFile(file, type);
    }
  };
  
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (!isMobile) {
    if (!confirm('📱 This works best on mobile where it opens your camera directly.\n\nOn desktop, you can still select a photo from your files.\n\nContinue?')) {
      return;
    }
  }
  
  input.click();
}

// ========== Free Proof Functions ==========
function openFreeProof(source) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = source === 'screenshot' ? 'image/*' : '*/*';
  
  input.onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
      openFreeProofWithFile(file, source);
    }
  };
  
  input.click();
}

async function openFreeProofWithFile(file, source) {
  // Show loading overlay
  var overlay = document.createElement('div');
  overlay.id = 'freeProofLoading';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10000;color:#fff;font-family:inherit;';
  overlay.innerHTML = '<div style="font-size:48px;margin-bottom:20px;">⏳</div><div style="font-size:20px;font-weight:700;margin-bottom:8px;">Timestamping your file...</div><div style="font-size:14px;color:#8b949e;">Creating hash and anchoring to the blockchain</div>';
  document.body.appendChild(overlay);

  try {
    // Compute hash locally
    const hash = await sha256Hex(file);
    
    // Send to free proof endpoint
    const response = await fetch('/.netlify/functions/create_free_proof', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hash: hash,
        filename: file.name,
        source: source
      })
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'Failed to create proof');
    }
    
    // Remove loading overlay
    overlay.remove();

    // Open verify page in new tab
    window.open(data.verifyUrl, '_blank');
    
  } catch (err) {
    // Remove loading overlay on error
    overlay.remove();
    alert('Error: ' + err.message);
  }
}

// ========== Modal Functions ==========
function closeFreeProofModal() {
  const modal = document.getElementById('freeProofModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ========== FAQ Accordion ==========
function initFaqAccordion() {
  document.querySelectorAll('.faq-q').forEach(function(question) {
    question.addEventListener('click', function() {
      var item = this.parentElement;
      // Close all other items
      document.querySelectorAll('.faq-item').forEach(function(other) {
        if (other !== item) {
          other.classList.remove('open');
        }
      });
      // Toggle current item
      item.classList.toggle('open');
    });
  });
}

// ========== Year Footer ==========
function initYear() {
  const yrEl = document.getElementById('yr');
  if (yrEl) {
    yrEl.textContent = new Date().getFullYear();
  }
}

// ========== Initialize Everything on DOM Ready ==========
document.addEventListener('DOMContentLoaded', function() {
  initYear();
  initFaqAccordion();
});
