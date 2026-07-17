    'use strict';

    window.triggerFrontageUpload = function() {
      document.getElementById('input-frontage').click();
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

        const response = await fetch('/api/upload', {
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

        const response = await fetch('/api/upload', {
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

      const photos = door.photos || [];

      const container = document.getElementById(`door-pics-container-${doorIndex}`);
      if (!container) return;

      let thumbsHtml = '';
      photos.forEach((url, idx) => {
        thumbsHtml += `
          <div style="position: relative; display: inline-block; width: 44px; height: 44px;">
            <img class="door-thumbnail" src="${url}" alt="Door Pic" style="width: 44px; height: 44px; margin: 0;" />
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

        const response = await fetch('/api/upload', {
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

        const response = await fetch('/api/upload', {
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
