    'use strict';

    let completionProofDoorIndex = null;
    let completionProofSku = '';
    let completionProofFile = null;
    let completionProofPreviewUrl = '';

    window.triggerFrontageUpload = function() {
      document.getElementById('input-frontage').click();
    };

    window.openDoorCompletionProofModal = function(doorIndex, sku = '') {
      completionProofDoorIndex = doorIndex;
      completionProofSku = String(sku || '');
      completionProofFile = null;
      if (completionProofPreviewUrl) URL.revokeObjectURL(completionProofPreviewUrl);
      completionProofPreviewUrl = '';

      const input = document.getElementById('completion-proof-input');
      const preview = document.getElementById('completion-proof-preview');
      const placeholder = document.getElementById('completion-proof-placeholder');
      const submit = document.getElementById('btn-completion-proof-submit');
      const context = document.getElementById('completion-proof-context');
      if (input) input.value = '';
      if (preview) { preview.removeAttribute('src'); preview.style.display = 'none'; }
      if (placeholder) placeholder.style.display = 'flex';
      if (submit) { submit.disabled = true; submit.textContent = 'Done'; }
      if (context) context.textContent = doorIndex >= 0 ? `Door ${doorIndex + 1}` : completionProofSku;

      document.getElementById('details-modal')?.classList.add('stacked-under');
      document.getElementById('completion-proof-modal')?.classList.add('open');
    };

    window.closeDoorCompletionProofModal = function() {
      document.getElementById('completion-proof-modal')?.classList.remove('open');
      document.getElementById('details-modal')?.classList.remove('stacked-under');
      if (completionProofPreviewUrl) URL.revokeObjectURL(completionProofPreviewUrl);
      completionProofPreviewUrl = '';
      completionProofFile = null;
      completionProofDoorIndex = null;
      completionProofSku = '';
    };

    window.handleCompletionProofSelect = async function(event) {
      const originalFile = event.target.files?.[0];
      if (!originalFile) return;
      const file = await compressImage(originalFile);
      if (!file || !String(file.type || '').startsWith('image/')) {
        showToast('Choose an image for the completed-task proof.', true);
        event.target.value = '';
        return;
      }
      completionProofFile = file;
      if (completionProofPreviewUrl) URL.revokeObjectURL(completionProofPreviewUrl);
      completionProofPreviewUrl = URL.createObjectURL(file);
      const preview = document.getElementById('completion-proof-preview');
      const placeholder = document.getElementById('completion-proof-placeholder');
      if (preview) { preview.src = completionProofPreviewUrl; preview.style.display = 'block'; }
      if (placeholder) placeholder.style.display = 'none';
      const submit = document.getElementById('btn-completion-proof-submit');
      if (submit) submit.disabled = false;
    };

    window.handleCompletionProofDrop = function(event) {
      event.preventDefault();
      event.currentTarget.style.borderColor = 'var(--border)';
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      handleCompletionProofSelect({ target: { files: [file], value: '' } });
    };

    window.submitDoorCompletionProof = async function() {
      if (!completionProofFile || completionProofDoorIndex === null) return;
      const syntheticInput = {
        files: [completionProofFile],
        dataset: { sku: completionProofSku, buttonId: 'btn-completion-proof-submit' },
        value: ''
      };
      const completed = await handleUnassignedDoorDoneProof({ target: syntheticInput }, completionProofDoorIndex);
      if (completed) closeDoorCompletionProofModal();
    };

    window.handleUnassignedDoorDoneProof = async function(event, doorIndex) {
      const input = event.target;
      const originalFile = input.files?.[0];
      if (!originalFile || !selectedBooking) return;

      const button = document.getElementById(input.dataset.buttonId || `btn-door-done-${doorIndex}`);
      if (button) {
        button.disabled = true;
        button.textContent = 'Uploading...';
      }

      try {
        const { data: freshBooking, error: fetchError } = await sb
          .from('installation_bookings')
          .select('doors,status,installers,installer_id')
          .eq('id', selectedBooking.id)
          .eq('company_id', currentCompanyId)
          .maybeSingle();
        if (fetchError) throw fetchError;

        let doorsArr = [];
        if (Array.isArray(freshBooking?.doors)) doorsArr = freshBooking.doors;
        else {
          try { doorsArr = JSON.parse(freshBooking?.doors || '[]'); } catch (_) { doorsArr = []; }
        }
        if (doorIndex < 0) {
          const targetSku = String(input.dataset.sku || '').trim();
          if (!targetSku) throw new Error('This product is no longer available. Refresh the booking and try again.');
          const existingDoorIndex = doorsArr.findIndex(item => (
            Array.isArray(item?.products) && item.products.includes(targetSku)
          ));
          if (existingDoorIndex >= 0) {
            doorIndex = existingDoorIndex;
          } else {
            doorsArr.push({
              doorMaterial: 'N/A',
              jambMaterial: 'N/A',
              swing: 'N/A',
              products: [targetSku],
              installers: [],
              photos: [],
              completed: false,
              signature: null,
              media_urls: []
            });
            doorIndex = doorsArr.length - 1;
          }
        }
        const door = doorsArr[doorIndex];
        if (!door) throw new Error('This door is no longer available. Refresh the booking and try again.');
        if (doorHasCompletionAssignment(door, freshBooking, doorsArr)) {
          throw new Error('This door now has an installer assignment. Use the standard completion workflow.');
        }

        const file = await compressImage(originalFile);
        if (!file || !String(file.type || '').startsWith('image/')) {
          throw new Error('Choose an image for the completed-task proof.');
        }

        const reader = new FileReader();
        const fileBase64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const response = await window.BKAuth.authenticatedFetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileBase64,
            fileName: file.name,
            category: 'installations',
            type: 'doors',
            refId: selectedBooking.reference_id || selectedBooking.id,
            companyId: currentCompanyId
          })
        });
        const responseText = await response.text();
        let result;
        try { result = JSON.parse(responseText); } catch (_) { result = null; }
        if (!response.ok || !result?.success || !result.url) {
          throw new Error(result?.error || 'The completion proof could not be uploaded.');
        }

        const proofUrl = result.url;
        door.media_urls = [...new Set([...(Array.isArray(door.media_urls) ? door.media_urls : []), proofUrl])];
        door.other_media = [...new Set([...(Array.isArray(door.other_media) ? door.other_media : []), proofUrl])];
        door.completed = true;
        door.completed_at = new Date().toISOString();
        door.signature = null;
        door.checklist = [];

        const updatePayload = { doors: doorsArr };
        if (doorsArr.length > 0 && doorsArr.every(item => item?.completed)) {
          updatePayload.status = 'completed';
        }
        const { error: updateError } = await sb
          .from('installation_bookings')
          .update(updatePayload)
          .eq('id', selectedBooking.id)
          .eq('company_id', currentCompanyId);
        if (updateError) throw updateError;

        const bookingIndex = dbBookings.findIndex(booking => booking.id === selectedBooking.id);
        if (bookingIndex >= 0) Object.assign(dbBookings[bookingIndex], updatePayload);
        Object.assign(selectedBooking, updatePayload);
        showToast('Door marked done with completion proof.');
        await showBookingDetails(selectedBooking.id);
        applyFilterAndRender();
        return true;
      } catch (error) {
        console.error('Could not complete unassigned door:', error);
        const actionableMessages = new Set([
          'This door is no longer available. Refresh the booking and try again.',
          'This product is no longer available. Refresh the booking and try again.',
          'This door now has an installer assignment. Use the standard completion workflow.',
          'Choose an image for the completed-task proof.'
        ]);
        const message = actionableMessages.has(error.message)
          ? error.message
          : 'The completion proof could not be saved. Please try again.';
        showToast(message, true);
        if (button) {
          button.disabled = false;
          button.textContent = 'Done';
        }
        return false;
      } finally {
        input.value = '';
      }
    };

    window.handleFrontageUpload = async function(event) {
      const originalFile = event.target.files[0];
      if (!originalFile) return;
      const file = await compressImage(originalFile);

      const uploadContainer = document.getElementById('upload-frontage-container');
      const originalHtml = uploadContainer.innerHTML;
      uploadContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;">
          <div class="bk-spinner"></div>
          <span style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 600;">Uploading...</span>
        </div>
      `;
      uploadContainer.style.pointerEvents = 'none';

      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const fileBase64 = await base64Promise;

        const response = await window.BKAuth.authenticatedFetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileBase64,
            fileName: file.name,
            category: 'installations',
            type: 'site',
            refId: selectedBooking.reference_id || selectedBooking.id,
            companyId: currentCompanyId
          })
        });

        let result;
        const responseText = await response.text();
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          throw new Error(responseText.substring(0, 150) || 'Upload failed');
        }
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        const imageUrl = result.url;

        // Update in Supabase
        const { error } = await sb
          .from('installation_bookings')
          .update({ frontage_image_url: imageUrl })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        // Update local memory
        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].frontage_image_url = imageUrl;
        }
        selectedBooking.frontage_image_url = imageUrl;

        showToast('House frontage uploaded successfully!');
        updateFrontageUI();
        applyFilterAndRender();
      } catch (err) {
        console.error(err);
        showToast('Failed to upload frontage: ' + err.message, true);
      } finally {
        uploadContainer.innerHTML = originalHtml;
        uploadContainer.style.pointerEvents = 'auto';
        event.target.value = ''; // Reset input
      }
    };

    window.removeFrontage = async function(event) {
      event.stopPropagation();
      const ok = await BKDialog.ask({
        title: 'Remove House Frontage',
        message: 'This will remove the uploaded frontage photo from the booking.',
        okText: 'Remove',
        danger: true
      });
      if (!ok) return;

      const btn = document.getElementById('btn-remove-frontage');
      const originalText = btn.innerText;
      btn.innerText = 'Deleting...';
      btn.disabled = true;

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({ frontage_image_url: null })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].frontage_image_url = null;
        }
        selectedBooking.frontage_image_url = null;

        showToast('House frontage removed.');
        updateFrontageUI();
        applyFilterAndRender();
      } catch (err) {
        console.error(err);
        showToast('Failed to remove frontage: ' + err.message, true);
      } finally {
        btn.innerText = originalText;
        btn.disabled = false;
      }
    };

    window.triggerMapUpload = function() {
      document.getElementById('input-map').click();
    };

    window.handleMapUpload = async function(event) {
      const file = await compressImage(event.target.files[0]);
      if (!file) return;

      const uploadContainer = document.getElementById('upload-map-container');
      const originalHtml = uploadContainer.innerHTML;
      uploadContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;">
          <div class="bk-spinner"></div>
          <span style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 600;">Uploading...</span>
        </div>
      `;
      uploadContainer.style.pointerEvents = 'none';

      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const fileBase64 = await base64Promise;

        const response = await window.BKAuth.authenticatedFetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileBase64,
            fileName: file.name,
            category: 'installations',
            type: 'site',
            refId: selectedBooking.reference_id || selectedBooking.id,
            companyId: currentCompanyId
          })
        });

        let result;
        const responseText = await response.text();
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          throw new Error(responseText.substring(0, 150) || 'Upload failed');
        }
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        const imageUrl = result.url;

        // Update in Supabase
        const { error } = await sb
          .from('installation_bookings')
          .update({ map_image_url: imageUrl })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        // Update local memory
        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].map_image_url = imageUrl;
        }
        selectedBooking.map_image_url = imageUrl;

        showToast('Map/location guide uploaded successfully!');
        updateMapUI();
        applyFilterAndRender();
      } catch (err) {
        console.error(err);
        showToast('Failed to upload map: ' + err.message, true);
      } finally {
        uploadContainer.innerHTML = originalHtml;
        uploadContainer.style.pointerEvents = 'auto';
        event.target.value = ''; // Reset input
      }
    };

    window.removeMap = async function(event) {
      event.stopPropagation();
      const ok = await BKDialog.ask({
        title: 'Remove Map/Location Guide',
        message: 'This will remove the uploaded map/location guide from the booking.',
        okText: 'Remove',
        danger: true
      });
      if (!ok) return;

      const btn = document.getElementById('btn-remove-map');
      const originalText = btn.innerText;
      btn.innerText = 'Deleting...';
      btn.disabled = true;

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({ map_image_url: null })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].map_image_url = null;
        }
        selectedBooking.map_image_url = null;

        showToast('Map/location guide removed.');
        updateMapUI();
        applyFilterAndRender();
      } catch (err) {
        console.error(err);
        showToast('Failed to remove map: ' + err.message, true);
      } finally {
        btn.innerText = originalText;
        btn.disabled = false;
      }
    };

    window.editDoorPics = function(doorIndex) {
      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }
      
      const door = doorsArr[doorIndex];
      if (!door) return;

      const photos = (door.photos || []).filter(url => typeof url === 'string' && url.trim() && url !== 'null' && url !== 'undefined');
      door.photos = photos;

      const container = document.getElementById(`door-pics-container-${doorIndex}`);
      if (!container) return;

      let thumbsHtml = '';
      photos.forEach((url, idx) => {
        thumbsHtml += `
          <div style="position: relative; display: inline-block; width: 44px; height: 44px;">
            <img class="door-thumbnail" src="${url}" alt="Door Pic" onerror="this.parentElement.remove()" style="width: 44px; height: 44px; margin: 0;" />
            <button type="button" onclick="deleteDoorPic(${doorIndex}, ${idx})" style="position: absolute; top: -4px; right: -4px; background: var(--danger); border: none; color: white; border-radius: 50%; width: 14px; height: 14px; font-size: 8px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;" title="Delete">x</button>
          </div>
        `;
      });

      let uploadBtnHtml = '';
      if (photos.length < 5) {
        uploadBtnHtml = `
          <div style="position: relative; display: inline-block; width: 44px; height: 44px; border: 2px dashed var(--border); border-radius: 4px; background: var(--bg-base); cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="triggerDoorPicUpload(${doorIndex})" title="Upload Photo (Max 5)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            <input type="file" id="input-door-pic-${doorIndex}" accept="image/*" style="display: none;" onchange="handleDoorPicUpload(event, ${doorIndex})" />
          </div>
        `;
      }

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.5rem; background: var(--bg-elevated); padding: 0.5rem; border-radius: 6px; border: 1px solid var(--border);">
          <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
            ${thumbsHtml}
            ${uploadBtnHtml}
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 0.35rem;">
            <button type="button" class="btn btn-outline btn-xs" onclick="cancelDoorPicsEdit(${doorIndex})" style="padding: 2px 6px; font-size: 0.72rem;">Done</button>
          </div>
        </div>
      `;
    };

    window.triggerDoorPicUpload = function(doorIndex) {
      document.getElementById(`input-door-pic-${doorIndex}`).click();
    };

    window.handleDoorPicUpload = async function(event, doorIndex) {
      const file = await compressImage(event.target.files[0]);
      if (!file) return;

      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }

      const door = doorsArr[doorIndex];
      if (!door) return;

      const photos = door.photos || [];
      if (photos.length >= 5) {
        showToast('Maximum of 5 photos allowed per door.', true);
        return;
      }

      // Show spinner or loading state
      const container = document.getElementById(`door-pics-container-${doorIndex}`);
      const originalHtml = container.innerHTML;
      container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem;">
          <div class="bk-spinner" style="width: 1rem; height: 1rem;"></div>
          <span style="font-size: 0.75rem;">Uploading pic...</span>
        </div>
      `;

      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const fileBase64 = await base64Promise;

        const response = await window.BKAuth.authenticatedFetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileBase64,
            fileName: file.name,
            category: 'installations',
            type: 'doors',
            refId: selectedBooking.reference_id || selectedBooking.id,
            companyId: currentCompanyId
          })
        });

        let result;
        const responseText = await response.text();
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          throw new Error(responseText.substring(0, 150) || 'Upload failed');
        }
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        const imageUrl = result.url;
        if (!imageUrl || imageUrl === 'null' || imageUrl === 'undefined') {
          throw new Error('The upload finished without a valid photo URL. Please retry the upload.');
        }

        // Push to local array
        if (!door.photos) door.photos = [];
        door.photos.push(imageUrl);

        // Update in Supabase
        const { error } = await sb
          .from('installation_bookings')
          .update({ doors: doorsArr })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        // Update local memory
        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].doors = doorsArr;
        }
        selectedBooking.doors = doorsArr;

        showToast('Door photo uploaded successfully!');
        editDoorPics(doorIndex); // refresh edit view
      } catch (err) {
        console.error(err);
        showToast('Failed to upload photo: ' + err.message, true);
        container.innerHTML = originalHtml;
      }
    };

    window.deleteDoorPic = async function(doorIndex, photoIndex) {
      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }

      const door = doorsArr[doorIndex];
      if (!door) return;

      const ok = await BKDialog.ask({
        title: 'Delete Photo',
        message: 'Are you sure you want to remove this door photo?',
        okText: 'Delete',
        danger: true
      });
      if (!ok) return;

      door.photos.splice(photoIndex, 1);

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({ doors: doorsArr })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        // Update local memory
        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].doors = doorsArr;
        }
        selectedBooking.doors = doorsArr;

        showToast('Door photo removed.');
        editDoorPics(doorIndex); // refresh edit view
      } catch (err) {
        console.error(err);
        showToast('Failed to remove photo: ' + err.message, true);
      }
    };

    window.cancelDoorPicsEdit = function(doorIndex) {
      showBookingDetails(selectedBooking.id);
    };

    window.triggerWorkPermitUpload = function() {
      document.getElementById('input-work-permit').click();
    };

    window.handleWorkPermitUpload = async function(event) {
      const file = await compressImage(event.target.files[0]);
      if (!file) return;

      const uploadContainer = document.getElementById('upload-work-permit-container');
      const originalHtml = uploadContainer.innerHTML;
      uploadContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem;">
          <div class="bk-spinner"></div>
          <span style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 600;">Uploading...</span>
        </div>
      `;
      uploadContainer.style.pointerEvents = 'none';

      try {
        const reader = new FileReader();
        const base64Promise = new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        const fileBase64 = await base64Promise;

        const response = await window.BKAuth.authenticatedFetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileBase64,
            fileName: file.name,
            category: 'installations',
            type: 'permit',
            refId: selectedBooking.reference_id || selectedBooking.id,
            companyId: currentCompanyId
          })
        });

        let result;
        const responseText = await response.text();
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          throw new Error(responseText.substring(0, 150) || 'Upload failed');
        }
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        const imageUrl = result.url;

        // Update in Supabase
        const { error } = await sb
          .from('installation_bookings')
          .update({ work_permit_image_url: imageUrl })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        // Update local memory
        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].work_permit_image_url = imageUrl;
        }
        selectedBooking.work_permit_image_url = imageUrl;

        showToast('Work permit uploaded successfully!');
        updateWorkPermitUI();
        applyFilterAndRender();
      } catch (err) {
        console.error(err);
        showToast('Failed to upload work permit: ' + err.message, true);
      } finally {
        uploadContainer.innerHTML = originalHtml;
        uploadContainer.style.pointerEvents = 'auto';
        event.target.value = ''; // Reset input
      }
    };

    window.removeWorkPermit = async function(event) {
      event.stopPropagation();
      const ok = await BKDialog.ask({
        title: 'Remove Work Permit',
        message: 'This will remove the uploaded work permit from the booking.',
        okText: 'Remove',
        danger: true
      });
      if (!ok) return;

      const btn = document.getElementById('btn-remove-work-permit');
      const originalText = btn.innerText;
      btn.innerText = 'Deleting...';
      btn.disabled = true;

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({ work_permit_image_url: null })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].work_permit_image_url = null;
        }
        selectedBooking.work_permit_image_url = null;

        showToast('Work permit removed.');
        updateWorkPermitUI();
        applyFilterAndRender();
      } catch (err) {
        console.error(err);
        showToast('Failed to remove work permit: ' + err.message, true);
      } finally {
        btn.innerText = originalText;
        btn.disabled = false;
      }
    };
