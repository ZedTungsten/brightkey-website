    'use strict';

    window.bookingDoorSelectOptions = function(options, selectedValue) {
      const values = [...new Set([selectedValue, ...options].filter(Boolean))];
      return values.map(value => `
        <option value="${escapeHtml(value)}" ${value === selectedValue ? 'selected' : ''}>${escapeHtml(value)}</option>
      `).join('');
    };

    function getSelectedBookingDoors() {
      if (Array.isArray(selectedBooking?.doors)) return selectedBooking.doors;
      if (typeof selectedBooking?.doors === 'string') {
        try {
          const parsed = JSON.parse(selectedBooking.doors);
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      }
      return [];
    }

    window.toggleDoorSpecificationsEdit = function(doorIndex, isEditing) {
      document.getElementById(`door-spec-view-${doorIndex}`)?.toggleAttribute('hidden', isEditing);
      document.getElementById(`door-spec-edit-${doorIndex}`)?.toggleAttribute('hidden', !isEditing);
      document.getElementById(`door-spec-edit-button-${doorIndex}`)?.toggleAttribute('hidden', isEditing);
    };

    window.saveDoorSpecifications = async function(doorIndex, button) {
      if (!selectedBooking || !currentCompanyId) return;
      const doors = getSelectedBookingDoors().map(door => ({ ...door }));
      if (!doors[doorIndex]) return;

      const editor = document.getElementById(`door-spec-edit-${doorIndex}`);
      const doorMaterial = editor?.querySelector('[data-door-spec="doorMaterial"]')?.value;
      const jambMaterial = editor?.querySelector('[data-door-spec="jambMaterial"]')?.value;
      const swing = editor?.querySelector('[data-door-spec="swing"]')?.value;
      if (!doorMaterial || !jambMaterial || !swing) return;

      button.disabled = true;
      button.textContent = 'Saving…';
      doors[doorIndex] = { ...doors[doorIndex], doorMaterial, jambMaterial, swing };

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({ doors })
          .eq('id', selectedBooking.id)
          .eq('company_id', currentCompanyId);
        if (error) throw error;

        selectedBooking.doors = doors;
        const bookingIndex = dbBookings.findIndex(booking => booking.id === selectedBooking.id);
        if (bookingIndex >= 0) dbBookings[bookingIndex].doors = doors;
        showToast('Door specifications updated successfully.');
        await showBookingDetails(selectedBooking.id);
      } catch (error) {
        console.error('Failed to update door specifications:', error);
        showToast('Failed to update door specifications.', true);
        button.disabled = false;
        button.textContent = 'Save';
      }
    };
