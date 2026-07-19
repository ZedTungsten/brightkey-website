    'use strict';

    // --- Installer Uploads Modal & Upload logic ---
    window.openUploadModal = function(doorIndex) {
      if (!selectedBooking) return;
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
      if (door.required_media) {
        if (bookingMediaRequirements && bookingMediaRequirements.length > 0) {
          bookingMediaRequirements.forEach((item, idx) => {
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
      
      document.getElementById('upload-modal').classList.add('open');
    };

    window.closeUploadModal = function() {
      document.getElementById('upload-modal').classList.remove('open');
      const detModal = document.getElementById('details-modal');
      if (detModal) detModal.classList.remove('stacked-under');
      uploadDoorIndex = null;
    };

    window.openChecklistModal = function(doorIndex) {
      if (!selectedBooking) return;
      
      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }
      
      const door = doorsArr[doorIndex];
      if (!door) return;

      const detModal = document.getElementById('details-modal');
      if (detModal) {
        detModal.classList.add('stacked-under');
      }

      const custNameEl = document.getElementById('checklist-customer-name');
      const instDateEl = document.getElementById('checklist-install-date');
      
      if (custNameEl) {
        custNameEl.innerText = selectedBooking.customer_name || 'N/A';
      }
      
      if (instDateEl) {
        if (door.completed_at) {
          instDateEl.innerText = formatDateFriendly(door.completed_at);
        } else if (selectedBooking.scheduled_date) {
          instDateEl.innerText = formatDateFriendly(selectedBooking.scheduled_date);
        } else {
          instDateEl.innerText = 'N/A';
        }
      }

      const checklistContainer = document.getElementById('checklist-items-container');
      if (checklistContainer) {
        let items = [];
        if (Array.isArray(door.checklist) && door.checklist.length > 0) {
          items = door.checklist.map(ch => ({ text: ch.item || ch.text || '', indent: ch.indent || false }));
        } else {
          items = (bookingChecklist && bookingChecklist.length > 0) ? bookingChecklist : [
            { text: "Door opens and closes smoothly without obstruction", indent: false },
            { text: "Smart lock operates properly (locking and unlocking)", indent: false },
            { text: "Smart lock is successfully connected to the mobile app", indent: false },
            { text: "I know how to create an account on the app", indent: true },
            { text: "I have registered RFID card on the device", indent: true },
            { text: "All components, including the camera, screen, handle, keypad, mechanical unlock, and deadbolt, are free of defects", indent: false },
            { text: "Screws and fasteners are securely installed", indent: false },
            { text: "I have been invited to leave a review for LOOCK Cavite and has consented to taking a photo with the device for documentation", indent: false },
            { text: "Warranty coverage: 1 year on factory defects, 7 days on installation warranty (excludes user-caused damage, service may apply)", indent: false }
          ];
        }

        checklistContainer.innerHTML = items.map(ch => {
          return `
            <label style="display:flex; align-items:flex-start; gap:0.55rem; cursor:pointer;${ch.indent ? ' margin-left:1.2rem;' : ''}">
              <input type="checkbox" class="checklist-item" style="margin-top:0.15rem;" checked disabled />
              <span>${escapeHtml(ch.text || '')}</span>
            </label>
          `;
        }).join('');
      }

      const previewImgEl = document.getElementById('signature-preview-img');
      if (previewImgEl) {
        previewImgEl.src = door.signature || '';
      }

      document.getElementById('checklist-modal').classList.add('open');
    };

    window.closeChecklistModal = function() {
      document.getElementById('checklist-modal').classList.remove('open');
      const detModal = document.getElementById('details-modal');
      if (detModal) {
        detModal.classList.remove('stacked-under');
      }
    };

    function renderRequiredMediaChecklist() {
      const container = document.getElementById('required-media-list');
      const section = document.getElementById('required-media-section');
      if (!container) return;

      if (!bookingMediaRequirements || bookingMediaRequirements.length === 0) {
        section.style.display = 'none';
        return;
      }

      section.style.display = 'flex';
      container.innerHTML = '';

      bookingMediaRequirements.forEach((item, idx) => {
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
          ? `<span onclick="event.stopPropagation(); openLightbox('${escapeHtml(item.guide_url)}')" style="display:inline-flex; align-items:center; color:var(--blue-light); cursor:pointer; padding: 2px;" title="View Guide">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
             </span>`
          : '';

        const currentFile = slotFiles[idx];
        if (currentFile) {
          if (currentFile.progress < 100) {
            // Uploading state
            itemRow.innerHTML = `
              <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:4px; background:var(--bg-surface); overflow:hidden;">
                <div style="display:flex; justify-content:space-between; gap:0.25rem; align-items:flex-start;">
                  <span style="font-size:0.72rem; font-weight:700; color:var(--text-primary); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(item.label)}</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.25rem; align-items:center; justify-content:center; flex:1;">
                  <span style="font-size:0.68rem; font-weight:700; color:var(--text-secondary);">${currentFile.progress}%</span>
                  <div style="width:80%; height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
                    <div style="width:${currentFile.progress}%; height:100%; background:var(--blue); transition:width 0.15s;"></div>
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
              <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:4px; ${bgStyle} overflow:hidden; cursor:pointer;" onclick="openLightbox('${currentFile.url}')">
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
            <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px dashed var(--border); border-radius:4px; ${guideBg} overflow:hidden; cursor:pointer;" onclick="document.getElementById('slot-file-input-${idx}').click()">
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

      const requirement = bookingMediaRequirements[idx];
      const lowerName = file.name.toLowerCase();

      // 0-byte file check
      if (file.size === 0) {
        showToast(`"${file.name}" is empty or corrupted (0 bytes).`, true);
        event.target.value = '';
        return;
      }

      // HEIC/HEIF check & conversion
      let finalFile = file;
      if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
        if (typeof heic2any !== 'undefined') {
          showToast('Converting HEIC image to JPEG, please wait...', false);
          try {
            const conversionResult = await heic2any({
              blob: file,
              toType: "image/jpeg"
            });
            const blob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
            finalFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
              type: "image/jpeg"
            });
          } catch (e) {
            console.error("HEIC/HEIF conversion failed:", e);
            showToast(`HEIC conversion failed for "${file.name}". Please convert manually.`, true);
            event.target.value = '';
            return;
          }
        } else {
          showToast(`HEIC files are not natively supported. Please convert "${file.name}" to JPG/PNG manually.`, true);
          event.target.value = '';
          return;
        }
      }

      const cleanLowerName = finalFile.name.toLowerCase();

      // Type checking
      if (requirement.type === 'image') {
        const isImg = finalFile.type.startsWith('image/') || cleanLowerName.endsWith('.png') || cleanLowerName.endsWith('.jpg') || cleanLowerName.endsWith('.jpeg');
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
      if (finalFile.type.startsWith('video/') || cleanLowerName.endsWith('.mp4') || cleanLowerName.endsWith('.mov')) {
        const checkDuration = () => {
          return new Promise((resolve) => {
            const url = URL.createObjectURL(finalFile);
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
      slotFiles[idx] = { file: finalFile, progress: 0 };
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
      const path = `companies/${currentCompanyId}/reviews/finished_installations/${folderName}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

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
            <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:4px; background:var(--bg-surface); overflow:hidden;">
              <div style="font-size:0.72rem; font-weight:700; color:var(--text-primary); line-height:1.1; max-height:2.2em; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">${escapeHtml(file.name)}</div>
              <div style="display:flex; flex-direction:column; gap:0.25rem; align-items:center; justify-content:center; flex:1;">
                <span style="font-size:0.68rem; font-weight:700; color:var(--text-secondary);">${file.progress}%</span>
                <div style="width:80%; height:4px; background:var(--border); border-radius:2px; overflow:hidden;">
                  <div style="width:${file.progress}%; height:100%; background:var(--blue); transition:width 0.15s;"></div>
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
            <div style="position:relative; aspect-ratio:1; display:flex; flex-direction:column; justify-content:space-between; padding:0.5rem; border:1px solid var(--border); border-radius:4px; ${bgStyle} overflow:hidden; cursor:pointer;" onclick="openLightbox('${file.url}')">
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

        // 0-byte file check
        if (file.size === 0) {
          showToast(`"${file.name}" is empty or corrupted (0 bytes).`, true);
          continue;
        }

        // HEIC/HEIF check & conversion
        let finalFile = file;
        if (lowerName.endsWith('.heic') || lowerName.endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif') {
          if (typeof heic2any !== 'undefined') {
            showToast('Converting HEIC image to JPEG, please wait...', false);
            try {
              const conversionResult = await heic2any({
                blob: file,
                toType: "image/jpeg"
              });
              const blob = Array.isArray(conversionResult) ? conversionResult[0] : conversionResult;
              finalFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
                type: "image/jpeg"
              });
            } catch (e) {
              console.error("HEIC/HEIF conversion failed:", e);
              showToast(`HEIC conversion failed for "${file.name}". Please convert manually.`, true);
              continue;
            }
          } else {
            showToast(`HEIC files are not natively supported. Please convert "${file.name}" to JPG/PNG manually.`, true);
            continue;
          }
        }

        const cleanLowerName = finalFile.name.toLowerCase();
        const isAllowed = finalFile.type.startsWith('image/') || finalFile.type.startsWith('video/') ||
                          allowedTypes.some(ext => cleanLowerName.endsWith(ext));

        if (!isAllowed) {
          showToast(`${finalFile.name} format is not supported.`, true);
          continue;
        }

        if (finalFile.type.startsWith('video/') || cleanLowerName.endsWith('.mp4') || cleanLowerName.endsWith('.mov')) {
          const checkDuration = () => {
            return new Promise((resolve) => {
              const url = URL.createObjectURL(finalFile);
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
            showToast(`${finalFile.name} exceeds 30 seconds limit for other videos.`, true);
            continue;
          }
        }

        const otherIdx = otherFiles.length;
        otherFiles.push({ name: finalFile.name, progress: 0 });
        renderOtherMediaList();
        validateAndToggleSubmit();

        uploadOtherFile(finalFile, otherIdx);
      }
    };

    async function uploadOtherFile(file, otherIdx) {
      const cleanCustomerName = (selectedBooking.customer_name || 'Customer').replace(/[^a-zA-Z0-9]/g, '_');
      const folderName = `${selectedBooking.id}_${cleanCustomerName}`;
      const ext = file.name.split('.').pop();
      const path = `companies/${currentCompanyId}/reviews/finished_installations/${folderName}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

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

      let allRequirementsFilled = true;
      if (bookingMediaRequirements && bookingMediaRequirements.length > 0) {
        for (let i = 0; i < bookingMediaRequirements.length; i++) {
          const slot = slotFiles[i];
          if (!slot || !slot.url || slot.progress < 100) {
            allRequirementsFilled = false;
            break;
          }
        }
      } else {
        allRequirementsFilled = otherFiles.length > 0;
      }

      const anyOtherUploading = otherFiles.some(f => f.progress < 100);

      if (bookingMediaRequirements && bookingMediaRequirements.length > 0) {
        submitBtn.disabled = !allRequirementsFilled || anyOtherUploading;
      } else {
        submitBtn.disabled = otherFiles.length === 0 || anyOtherUploading;
      }
    }

    async function saveCurrentMediaState() {
      if (!selectedBooking || uploadDoorIndex === null) return;

      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }

      const door = doorsArr[uploadDoorIndex];
      if (!door) return;

      // 1. Build door.required_media
      door.required_media = {};
      bookingMediaRequirements.forEach((item, idx) => {
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

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({ doors: doorsArr })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        const idx = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (idx !== -1) {
          dbBookings[idx].doors = doorsArr;
          selectedBooking.doors = doorsArr;
        }

        validateAndToggleSubmit();
        applyFilterAndRender();
      } catch (err) {
        console.error('Failed to save door media state:', err);
        showToast('Failed to save media upload: ' + err.message, true);
      }
    }
