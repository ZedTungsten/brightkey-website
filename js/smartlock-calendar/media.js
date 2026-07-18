'use strict';

// --- Media Upload Modal Logic ---
let uploadDoorIndex = null;
let slotFiles = {}; // idx -> { file: File, url: string, progress: number }
let otherFiles = []; // array of { name: string, url: string, progress: number }

function getActiveReqs() {
  if (!selectedBooking) return [];
  const isEvent = selectedBooking.product_skus === 'Backjob' || selectedBooking.product_skus === 'Ocular' || selectedBooking.product_skus === 'Day off';
  return (isEvent ? [] : bookingMediaRequirements).filter(req => {
    if (req.label === 'Work Permit' && !selectedBooking.needs_work_permit) return false;
    return true;
  });
}

window.openUploadModal = function(doorIndex) {
  uploadDoorIndex = doorIndex;
  slotFiles = {};
  otherFiles = [];

  let doorsArr = [];
  if (typeof selectedBooking.doors === 'string') {
    try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
  } else if (Array.isArray(selectedBooking.doors)) {
    doorsArr = selectedBooking.doors;
  }
  const door = doorsArr[doorIndex];
  if (!door) return;

  // Populate existing required media from DB
  const activeReqs = getActiveReqs();
  if (door.required_media) {
    if (activeReqs && activeReqs.length > 0) {
      activeReqs.forEach((item, idx) => {
        const savedUrl = door.required_media[item.label];
        if (savedUrl) {
          slotFiles[idx] = { url: savedUrl, progress: 100 };
        }
      });
    }
  }

  // Populate existing other media from DB
  if (door.other_media && Array.isArray(door.other_media)) {
    door.other_media.forEach(url => {
      const fileName = url.split('/').pop().split('_').slice(1).join('_') || 'Uploaded Media';
      otherFiles.push({ name: fileName, url: url, progress: 100 });
    });
  }

  document.getElementById('other-media-input').value = '';
  document.getElementById('btn-submit-upload').disabled = true;
  document.getElementById('upload-progress-container').style.display = 'none';

  // Render required media checklist dynamically
  renderRequiredMediaChecklist();
  renderOtherMediaList();
  validateAndToggleSubmit();
  
  const detModal = document.getElementById('details-modal');
  if (detModal) detModal.classList.add('stacked-under');
  
  document.getElementById('upload-modal').style.display = 'flex';
};

window.closeUploadModal = function() {
  document.getElementById('upload-modal').style.display = 'none';
  const detModal = document.getElementById('details-modal');
  if (detModal) detModal.classList.remove('stacked-under');
  uploadDoorIndex = null;
};

function renderRequiredMediaChecklist() {
  const container = document.getElementById('required-media-list');
  const section = document.getElementById('required-media-section');
  if (!container) return;

  const activeReqs = getActiveReqs();
  if (!activeReqs || activeReqs.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'flex';
  container.innerHTML = '';

  activeReqs.forEach((item, idx) => {
    const itemRow = document.createElement('div');

    let typeText = 'Img/Vid';
    let acceptTypes = 'image/png, image/jpeg, image/jpg, video/mp4, video/quicktime, .mov';
    if (item.type === 'image') {
      typeText = 'Img Only';
      acceptTypes = 'image/png, image/jpeg, image/jpg';
    } else if (item.type === 'video') {
      typeText = 'Vid Only';
      acceptTypes = 'video/mp4, video/quicktime, .mov';
    }

    const guideHtml = item.guide_url
      ? `<span onclick="event.stopPropagation(); openLightbox('${escapeHtml(item.guide_url)}')" style="display:inline-flex; align-items:center; color:var(--cyan-light); cursor:pointer; padding: 2px;" title="View Guide">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
         </span>`
      : '';

    const currentFile = slotFiles[idx];
    if (currentFile) {
      if (currentFile.progress < 100) {
        // Uploading state
        itemRow.innerHTML = `
          <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-surface); overflow:hidden;">
            <div style="display:flex; justify-content:space-between; gap:0.25rem; align-items:flex-start;">
              <span style="font-size:0.72rem; font-weight:700; color:var(--text-primary); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(item.label)}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.25rem; align-items:center; justify-content:center; flex:1;">
              <span style="font-size:0.68rem; font-weight:700; color:var(--text-secondary);">${currentFile.progress}%</span>
              <div style="width:80%; height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
                <div style="width:${currentFile.progress}%; height:100%; background:var(--cyan); transition:width 0.15s;"></div>
              </div>
            </div>
          </div>
        `;
      } else {
        // Uploaded state
        const isImg = /\.(png|jpg|jpeg|gif|webp|heif|heic)(\?|$)/i.test(currentFile.url);
        const bgStyle = isImg 
          ? `background: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.6)), url('${currentFile.url}') no-repeat center; background-size: cover;` 
          : `background: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.7)), #111;`;
        
        const mediaPlayIcon = isImg ? '' : `
          <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:rgba(0,0,0,0.5); border-radius:50%; color:#fff; pointer-events:none;">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;stroke:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </div>
        `;

        itemRow.innerHTML = `
          <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:var(--radius-sm); ${bgStyle} overflow:hidden; cursor:pointer;" onclick="openLightbox('${currentFile.url}')">
            <button type="button" onclick="event.stopPropagation(); removeSlotFile(${idx});" style="position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%; background:rgba(220,53,69,0.95); border:none; color:#fff; font-size:0.85rem; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer; line-height:1; z-index:10; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">×</button>
            <div style="font-size:0.72rem; font-weight:700; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.8); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; pointer-events:none;">${escapeHtml(item.label)}</div>
            ${mediaPlayIcon}
            <div style="font-size:0.65rem; color:rgba(255,255,255,0.8); font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,0.8); pointer-events:none;">Uploaded</div>
          </div>
        `;
      }
    } else {
      // Empty / upload trigger state
      const guideBg = item.guide_url 
        ? `background: linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.85)), url('${item.guide_url}') no-repeat center; background-size: cover;`
        : `background: var(--bg-surface);`;

      itemRow.innerHTML = `
        <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px dashed var(--border); border-radius:var(--radius-sm); ${guideBg} overflow:hidden; cursor:pointer;" onclick="document.getElementById('slot-file-input-${idx}').click()">
          <div style="display:flex; justify-content:space-between; gap:0.25rem; align-items:flex-start; z-index:2;">
            <span style="font-size:0.72rem; font-weight:700; color:var(--text-primary); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; text-shadow:0 1px 2px rgba(255,255,255,0.8);">${escapeHtml(item.label)}</span>
            ${guideHtml}
          </div>
          <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; gap:0.15rem; color:var(--text-primary); z-index:2;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="filter:drop-shadow(0 1px 2px rgba(255,255,255,0.8));"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            <span style="font-size:0.68rem; font-weight:700; filter:drop-shadow(0 1px 2px rgba(255,255,255,0.8));">Upload</span>
          </div>
          <div style="font-size:0.62rem; color:var(--text-muted); font-weight:700; text-transform:uppercase; z-index:2; text-shadow:0 1px 2px rgba(255,255,255,0.8);">${typeText}</div>
          <input type="file" id="slot-file-input-${idx}" style="display:none;" accept="${acceptTypes}" onchange="handleSlotFileSelect(event, ${idx})" />
        </div>
      `;
    }
    container.appendChild(itemRow.firstElementChild);
  });
}

window.handleSlotFileSelect = async function(event, idx) {
  const file = event.target.files[0];
  if (!file) return;

  const activeReqs = getActiveReqs();
  const requirement = activeReqs[idx];
  const lowerName = file.name.toLowerCase();

  // Type checking
  if (requirement.type === 'image') {
    const isImg = file.type.startsWith('image/') || lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg');
    if (!isImg) {
      showToast('Invalid file format. Image required.', true);
      event.target.value = '';
      return;
    }
  } else if (requirement.type === 'video') {
    const isVid = file.type.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov');
    if (!isVid) {
      showToast('Invalid file format. Video required.', true);
      event.target.value = '';
      return;
    }
  }

  // Video duration check (max 60 seconds)
  if (file.type.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov')) {
    const checkDuration = () => {
      return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const tempVideo = document.createElement('video');
        tempVideo.preload = 'metadata';
        tempVideo.src = url;
        tempVideo.onloadedmetadata = function() {
          URL.revokeObjectURL(url);
          resolve(tempVideo.duration <= 60);
        };
      });
    };

    const isValidDuration = await checkDuration();
    if (!isValidDuration) {
      showToast('Required video must be 1 minute or less.', true);
      event.target.value = '';
      return;
    }
  }

  // Create local slot info and render progress immediately
  slotFiles[idx] = { file: file, progress: 0 };
  renderRequiredMediaChecklist();
  validateAndToggleSubmit();

  // Start automatic upload
  uploadSlotFile(idx);
};

async function uploadSlotFile(idx) {
  const slot = slotFiles[idx];
  if (!slot || !slot.file) return;

  const file = slot.file;
  const cleanCustomerName = (selectedBooking.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
  const folderName = `${selectedBooking.id}_${cleanCustomerName}`;
  const ext = file.name.split('.').pop();
  const path = `companies/${currentInstaller.company_id}/reviews/finished_installations/${folderName}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 90) {
        progress += 10;
        if (slotFiles[idx]) {
          slotFiles[idx].progress = progress;
          renderRequiredMediaChecklist();
        }
      }
    }, 150);

    const { data, error } = await sb.storage.from('brightkey-assets').upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });

    clearInterval(progressInterval);

    if (error) throw error;

    const { data: { publicUrl } } = sb.storage.from('brightkey-assets').getPublicUrl(path);

    slotFiles[idx] = { url: publicUrl, progress: 100 };
    renderRequiredMediaChecklist();

    await saveCurrentMediaState();
  } catch (err) {
    console.error(`Upload error for slot ${idx}:`, err);
    showToast(`Upload failed for ${file.name}: ${err.message}`, true);
    delete slotFiles[idx];
    renderRequiredMediaChecklist();
    validateAndToggleSubmit();
  }
}

window.removeSlotFile = async function(idx) {
  delete slotFiles[idx];
  renderRequiredMediaChecklist();
  await saveCurrentMediaState();
};

function renderOtherMediaList() {
  const container = document.getElementById('other-media-list');
  if (!container) return;
  container.innerHTML = '';

  otherFiles.forEach((file, idx) => {
    const itemRow = document.createElement('div');

    if (file.progress < 100) {
      // Uploading state
      itemRow.innerHTML = `
        <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-surface); overflow:hidden;">
          <div style="font-size:0.72rem; font-weight:700; color:var(--text-primary); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(file.name)}</div>
          <div style="display:flex; flex-direction:column; gap:0.25rem; align-items:center; justify-content:center; flex:1;">
            <span style="font-size:0.68rem; font-weight:700; color:var(--text-secondary);">${file.progress}%</span>
            <div style="width:80%; height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
              <div style="width:${file.progress}%; height:100%; background:var(--cyan); transition:width 0.15s;"></div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Uploaded state
      const isImg = /\.(png|jpg|jpeg|gif|webp|heif|heic)(\?|$)/i.test(file.url);
      const bgStyle = isImg 
        ? `background: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.6)), url('${file.url}') no-repeat center; background-size: cover;` 
        : `background: linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.7)), #111;`;
      
      const mediaPlayIcon = isImg ? '' : `
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); display:flex; align-items:center; justify-content:center; width:30px; height:30px; background:rgba(0,0,0,0.5); border-radius:50%; color:#fff; pointer-events:none;">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;stroke:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
      `;

      itemRow.innerHTML = `
        <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:var(--radius-sm); ${bgStyle} overflow:hidden; cursor:pointer;" onclick="openLightbox('${file.url}')">
          <button type="button" onclick="event.stopPropagation(); removeOtherFile(${idx});" style="position:absolute; top:4px; right:4px; width:20px; height:20px; border-radius:50%; background:rgba(220,53,69,0.95); border:none; color:#fff; font-size:0.85rem; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer; line-height:1; z-index:10; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">×</button>
          <div style="font-size:0.72rem; font-weight:700; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,0.8); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; pointer-events:none;">${escapeHtml(file.name)}</div>
          ${mediaPlayIcon}
          <div style="font-size:0.65rem; color:rgba(255,255,255,0.8); font-weight:600; text-shadow:0 1px 2px rgba(0,0,0,0.8); pointer-events:none;">Uploaded</div>
        </div>
      `;
    }

    container.appendChild(itemRow.firstElementChild);
  });
}

window.handleOtherMediaSelect = async function(event) {
  const files = Array.from(event.target.files);
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'video/mp4', 'video/quicktime', '.mov'];

  for (const file of files) {
    if (otherFiles.length >= 5) {
      showToast('Maximum 5 other media files allowed.', true);
      break;
    }

    const lowerName = file.name.toLowerCase();
    const isAllowed = file.type.startsWith('image/') || file.type.startsWith('video/') ||
                      allowedTypes.some(ext => lowerName.endsWith(ext));

    if (!isAllowed) {
      showToast(`${file.name} format is not supported.`, true);
      continue;
    }

    if (file.type.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov')) {
      const checkDuration = () => {
        return new Promise((resolve) => {
          const url = URL.createObjectURL(file);
          const tempVideo = document.createElement('video');
          tempVideo.preload = 'metadata';
          tempVideo.src = url;
          tempVideo.onloadedmetadata = function() {
            URL.revokeObjectURL(url);
            resolve(tempVideo.duration <= 30);
          };
        });
      };

      const isValidDuration = await checkDuration();
      if (!isValidDuration) {
        showToast(`${file.name} exceeds 30 seconds limit for other videos.`, true);
        continue;
      }
    }

    const otherIdx = otherFiles.length;
    otherFiles.push({ name: file.name, progress: 0 });
    renderOtherMediaList();
    validateAndToggleSubmit();

    uploadOtherFile(file, otherIdx);
  }
};

async function uploadOtherFile(file, otherIdx) {
  const cleanCustomerName = (selectedBooking.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
  const folderName = `${selectedBooking.id}_${cleanCustomerName}`;
  const ext = file.name.split('.').pop();
  const path = `companies/${currentInstaller.company_id}/reviews/finished_installations/${folderName}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  try {
    let progress = 0;
    const progressInterval = setInterval(() => {
      if (progress < 90) {
        progress += 10;
        if (otherFiles[otherIdx]) {
          otherFiles[otherIdx].progress = progress;
          renderOtherMediaList();
        }
      }
    }, 150);

    const { data, error } = await sb.storage.from('brightkey-assets').upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });

    clearInterval(progressInterval);

    if (error) throw error;

    const { data: { publicUrl } } = sb.storage.from('brightkey-assets').getPublicUrl(path);

    if (otherFiles[otherIdx]) {
      otherFiles[otherIdx].url = publicUrl;
      otherFiles[otherIdx].progress = 100;
    }
    renderOtherMediaList();

    await saveCurrentMediaState();
  } catch (err) {
    console.error(`Upload error for other file ${otherIdx}:`, err);
    showToast(`Upload failed for ${file.name}: ${err.message}`, true);
    otherFiles.splice(otherIdx, 1);
    renderOtherMediaList();
    validateAndToggleSubmit();
  }
}

window.removeOtherFile = async function(idx) {
  otherFiles.splice(idx, 1);
  renderOtherMediaList();
  await saveCurrentMediaState();
};

function validateAndToggleSubmit() {
  const submitBtn = document.getElementById('btn-submit-upload');
  if (!submitBtn) return;

  const anySlotUploading = Object.values(slotFiles).some(slot => slot && slot.progress < 100);
  const anyOtherUploading = otherFiles.some(f => f.progress < 100);

  submitBtn.disabled = anySlotUploading || anyOtherUploading;
}

async function saveCurrentMediaState() {
  if (!selectedBooking || uploadDoorIndex === null) return;

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

    const door = doorsArr[uploadDoorIndex];
    if (!door) return;

    // 1. Build door.required_media
    const activeReqs = getActiveReqs();
    door.required_media = {};
    activeReqs.forEach((item, idx) => {
      const slot = slotFiles[idx];
      if (slot && slot.url) {
        door.required_media[item.label] = slot.url;
      }
    });

    // 2. Build door.other_media
    door.other_media = [];
    otherFiles.forEach(item => {
      if (item && item.url) {
        door.other_media.push(item.url);
      }
    });

    // 3. Maintain flat door.media_urls for downstream views compatibility
    door.media_urls = [
      ...Object.values(door.required_media),
      ...door.other_media
    ];

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

    validateAndToggleSubmit();
  } catch (err) {
    console.error('Failed to auto-save media state to database:', err);
    showToast('Auto-save failed: ' + err.message, true);
  }
};
