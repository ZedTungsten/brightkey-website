'use strict';

// --- Checklist & Signature Canvas Verification ---
let canvas, ctx;
let isDrawing = false;
let signatureIndex = null;

function initSignatureCanvas() {
  canvas = document.getElementById('signature-canvas');
  if (!canvas) return;

  canvas.width = canvas.offsetWidth || canvas.parentElement.clientWidth || 380;
  canvas.height = canvas.offsetHeight || 130;

  ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#09090B';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  canvas.addEventListener('touchstart', startDrawingTouch);
  canvas.addEventListener('touchmove', drawTouch);
  canvas.addEventListener('touchend', stopDrawing);

  isDrawing = false;
}

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function getTouchPos(e) {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches[0];
  return {
    x: (touch.clientX - rect.left) * (canvas.width / rect.width),
    y: (touch.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function startDrawing(e) {
  isDrawing = true;
  const pos = getMousePos(e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  e.preventDefault();
}

function startDrawingTouch(e) {
  isDrawing = true;
  const pos = getTouchPos(e);
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
  e.preventDefault();
}

function draw(e) {
  if (!isDrawing) return;
  const pos = getMousePos(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  e.preventDefault();
  validateChecklist();
}

function drawTouch(e) {
  if (!isDrawing) return;
  const pos = getTouchPos(e);
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
  e.preventDefault();
  validateChecklist();
}

function stopDrawing() {
  isDrawing = false;
}

window.clearSignature = function() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  validateChecklist();
}

function isCanvasBlank() {
  if (!canvas) return true;
  const blank = document.createElement('canvas');
  blank.width = canvas.width;
  blank.height = canvas.height;
  return canvas.toDataURL() === blank.toDataURL();
}

window.validateChecklist = function() {
  const checkboxes = document.querySelectorAll('.checklist-item');
  const allChecked = Array.from(checkboxes).every(cb => cb.checked);
  const signed = !isCanvasBlank();

  const submitBtn = document.getElementById('btn-submit-checklist');
  if (submitBtn) {
    submitBtn.disabled = !(allChecked && signed);
  }
}

window.markEventDoorDone = async function(doorIndex, buttonEl) {
  if (!selectedBooking) return;
  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.innerText = 'Completing...';
  }

  try {
    // Fetch fresh doors array from DB first to prevent concurrent overwrite
    const { data: freshBooking, error: fetchErr } = await sb
      .from('installation_bookings')
      .select('doors')
      .eq('id', selectedBooking.id)
      .single();

    if (fetchErr) throw fetchErr;

    let doorsArr = [];
    if (freshBooking && freshBooking.doors) {
      if (typeof freshBooking.doors === 'string') {
        try { doorsArr = JSON.parse(freshBooking.doors); } catch(_) {}
      } else if (Array.isArray(freshBooking.doors)) {
        doorsArr = freshBooking.doors;
      }
    }

    while (doorsArr.length <= doorIndex) {
      doorsArr.push({
        doorMaterial: 'N/A',
        jambMaterial: 'N/A',
        swing: 'N/A',
        completed: false,
        signature: null,
        media_urls: []
      });
    }

    const door = doorsArr[doorIndex];
    if (!door) return;

    door.completed = true;
    door.completed_at = new Date().toISOString();
    door.signature = null;
    door.checklist = [];

    const isDone = doorsArr.length > 0 && doorsArr.every(d => d.completed);
    const updatePayload = { doors: doorsArr };
    if (isDone) {
      updatePayload.status = 'completed';
    }

    const { error } = await sb
      .from('installation_bookings')
      .update(updatePayload)
      .eq('id', selectedBooking.id);

    if (error) throw error;

    const idx = dbBookings.findIndex(b => b.id === selectedBooking.id);
    if (idx !== -1) {
      dbBookings[idx].doors = doorsArr;
      selectedBooking.doors = doorsArr;
    }

    localStorage.setItem(`bk_cache_${currentInstaller.id}`, JSON.stringify({
      data: dbBookings,
      timestamp: new Date().toISOString()
    }));

    showToast('Event marked as completed.');
    openDetailsModal(selectedBooking.id); // Refresh details modal
    drawAgenda(); // Refresh lists
  } catch (err) {
    console.error('Failed to complete event:', err);
    showToast('The job could not be completed. Your previous data is still safe. Please try again.', true);
    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.innerText = 'Done';
    }
  }
};

window.openChecklistModal = function(doorIndex, isReadOnly = false) {
  signatureIndex = doorIndex;
  
  // Add stacked-under visual effect to details modal
  const detModal = document.getElementById('details-modal');
  if (detModal) {
    detModal.classList.add('stacked-under');
  }

  // Populate customer name and installation date
  const custNameEl = document.getElementById('checklist-customer-name');
  const instDateEl = document.getElementById('checklist-install-date');
  
  let doorsArr = [];
  if (selectedBooking) {
    if (typeof selectedBooking.doors === 'string') {
      try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
    } else if (Array.isArray(selectedBooking.doors)) {
      doorsArr = selectedBooking.doors;
    }
  }
  const door = doorsArr[doorIndex];

  if (custNameEl && selectedBooking) {
    custNameEl.innerText = selectedBooking.customer_name || 'N/A';
  }

  if (isReadOnly && door && door.completed_at) {
    if (instDateEl) {
      instDateEl.innerText = formatDateFriendly(door.completed_at);
    }
  } else {
    if (instDateEl && selectedBooking) {
      instDateEl.innerText = selectedBooking.scheduled_date ? formatDateFriendly(selectedBooking.scheduled_date) : 'N/A';
    }
  }

  const checklistContainer = document.getElementById('checklist-items-container');
  if (checklistContainer) {
    if (isReadOnly && door && Array.isArray(door.checklist)) {
      checklistContainer.innerHTML = door.checklist.map(ch => {
        return `
          <label style="display:flex; align-items:flex-start; gap:0.55rem; cursor:pointer;${ch.indent ? ' margin-left:1.2rem;' : ''}">
            <input type="checkbox" class="checklist-item" style="margin-top:0.15rem;" ${ch.checked ? 'checked' : ''} disabled />
            <span>${escapeHtml(ch.item || '')}</span>
          </label>
        `;
      }).join('');
    } else {
      checklistContainer.innerHTML = bookingChecklist.map((ch, idx) => {
        return `
          <label style="display:flex; align-items:flex-start; gap:0.55rem; cursor:pointer;${ch.indent ? ' margin-left:1.2rem;' : ''}">
            <input type="checkbox" class="checklist-item" style="margin-top:0.15rem;" onchange="validateChecklist()" />
            <span>${escapeHtml(ch.text || '')}</span>
          </label>
        `;
      }).join('');
    }
  }

  document.getElementById('checklist-modal').style.display = 'flex';

  const canvasEl = document.getElementById('signature-canvas');
  const previewImgEl = document.getElementById('signature-preview-img');
  const actionsEl = document.getElementById('checklist-actions');
  const viewActionsEl = document.getElementById('checklist-view-actions');

  if (isReadOnly && door && door.signature) {
    if (canvasEl) canvasEl.style.display = 'none';
    if (previewImgEl) {
      previewImgEl.src = door.signature;
      previewImgEl.style.display = 'block';
    }
    if (actionsEl) actionsEl.style.display = 'none';
    if (viewActionsEl) viewActionsEl.style.display = 'flex';
  } else {
    if (canvasEl) canvasEl.style.display = 'block';
    if (previewImgEl) {
      previewImgEl.src = '';
      previewImgEl.style.display = 'none';
    }
    if (actionsEl) actionsEl.style.display = 'flex';
    if (viewActionsEl) viewActionsEl.style.display = 'none';

     const submitBtn = document.getElementById('btn-submit-checklist');
     if (submitBtn) {
       submitBtn.innerHTML = 'Submit';
       submitBtn.style.background = 'var(--success)';
       submitBtn.style.borderColor = 'var(--success)';
       submitBtn.style.color = '#fff';
     }

    setTimeout(() => {
      initSignatureCanvas();
      clearSignature();
    }, 150);
  }
};

window.closeChecklistModal = function() {
  document.getElementById('checklist-modal').style.display = 'none';
  
  // Remove stacked-under visual effect from details modal
  const detModal = document.getElementById('details-modal');
  if (detModal) {
    detModal.classList.remove('stacked-under');
  }

  // Re-enable checkboxes for future uses
  document.querySelectorAll('.checklist-item').forEach(cb => {
    cb.disabled = false;
  });

  signatureIndex = null;
};

window.submitChecklist = async function() {
  if (!selectedBooking || signatureIndex === null) return;
  
  const submitBtn = document.getElementById('btn-submit-checklist');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Submitting...';

  try {
    // Fetch fresh doors array from DB first to prevent concurrent overwrite
    const { data: freshBooking, error: fetchErr } = await sb
      .from('installation_bookings')
      .select('doors')
      .eq('id', selectedBooking.id)
      .single();

    if (fetchErr) throw fetchErr;

    let doorsArr = [];
    if (freshBooking && freshBooking.doors) {
      if (typeof freshBooking.doors === 'string') {
        try { doorsArr = JSON.parse(freshBooking.doors); } catch(_) {}
      } else if (Array.isArray(freshBooking.doors)) {
        doorsArr = freshBooking.doors;
      }
    }

    while (doorsArr.length <= signatureIndex) {
      doorsArr.push({
        doorMaterial: 'N/A',
        jambMaterial: 'N/A',
        swing: 'N/A',
        completed: false,
        signature: null,
        media_urls: []
      });
    }

    const door = doorsArr[signatureIndex];
    if (!door) return;

    const dataUrl = canvas.toDataURL('image/png');

    door.completed = true;
    door.signature = dataUrl;
    door.completed_at = new Date().toISOString();
    door.checklist = Array.from(document.querySelectorAll('.checklist-item')).map((cb, idx) => {
      return {
        item: cb.nextElementSibling ? cb.nextElementSibling.innerText.trim() : '',
        checked: cb.checked,
        indent: bookingChecklist[idx]?.indent || false
      };
    });

    const isDone = doorsArr.length > 0 && doorsArr.every(d => d.completed);
    const updatePayload = { doors: doorsArr };
    if (isDone) {
      updatePayload.status = 'completed';
    }

    const { error } = await sb
      .from('installation_bookings')
      .update(updatePayload)
      .eq('id', selectedBooking.id);

    if (error) throw error;

    // Update local memory
    const idx = dbBookings.findIndex(b => b.id === selectedBooking.id);
    if (idx !== -1) {
      dbBookings[idx].doors = doorsArr;
      selectedBooking.doors = doorsArr;
    }

    // Cache update
    localStorage.setItem(`bk_cache_${currentInstaller.id}`, JSON.stringify({
      data: dbBookings,
      timestamp: new Date().toISOString()
    }));

    // Transition button to "Submitted" success state (green, checkmark)
    submitBtn.style.background = 'var(--success, #22C55E)';
    submitBtn.style.borderColor = 'var(--success, #22C55E)';
    submitBtn.style.color = '#fff';
    submitBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>Submitted`;

    showToast('Installation verified and marked as done.');
    
    setTimeout(() => {
      closeChecklistModal();
      openDetailsModal(selectedBooking.id); // Refresh details modal
      drawAgenda(); // Refresh lists
    }, 800);
  } catch (err) {
    console.error('Failed to submit done verification:', err);
    showToast('The checklist could not be submitted. Your previous data is still safe. Please try again.', true);
    submitBtn.disabled = false;
    submitBtn.innerHTML = 'Submit';
    submitBtn.style.background = 'var(--success)';
    submitBtn.style.borderColor = 'var(--success)';
    submitBtn.style.color = '#fff';
  }
};

function showToast(msg, isError = false) {
  let c = document.getElementById('toast-container');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toast-container';
    document.body.appendChild(c);
  }
  const el = document.createElement('div');
  el.className = 'toast toast-' + (isError ? 'error' : 'success');
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
