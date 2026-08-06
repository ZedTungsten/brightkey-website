    'use strict';

    // Reschedule actions
    function openRescheduleModal() {
      if (!selectedBooking) return;
      document.getElementById('res-date').value = selectedBooking.scheduled_date || '';
      document.getElementById('res-time').value = isAfternoon(selectedBooking.scheduled_time) ? 'Afternoon' : 'Morning';
      toggleRescheduleModal(true);
    }

    function toggleRescheduleModal(show) {
      document.getElementById('reschedule-modal').classList.toggle('open', show);
    }

    function closeRescheduleModal(e) {
      if (e.target.id === 'reschedule-modal') {
        toggleRescheduleModal(false);
      }
    }

    async function saveReschedule(e) {
      e.preventDefault();
      if (!selectedBooking) return;

      const newDate = document.getElementById('res-date').value;
      const newTime = document.getElementById('res-time').value;

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({
            scheduled_date: newDate,
            scheduled_time: newTime,
            status: 'rescheduled'
          })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        // Update local memory
        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].scheduled_date = newDate;
          dbBookings[bookingIndex].scheduled_time = newTime;
          dbBookings[bookingIndex].status = 'rescheduled';
        }

        showToast('Rescheduled successfully!');
        toggleRescheduleModal(false);
        toggleDetailsModal(false);
        applyFilterAndRender();
      } catch (err) {
        console.error(err);
        showToast('Failed to reschedule: ' + err.message, true);
      }
    }

    // Abort booking actions
    function openAbortConfirmModal() {
      if (!selectedBooking) return;
      toggleAbortConfirmModal(true);
    }

    function toggleAbortConfirmModal(show) {
      document.getElementById('abort-confirm-modal').classList.toggle('open', show);
    }

    function closeAbortConfirmModal(e) {
      if (e.target.id === 'abort-confirm-modal') {
        toggleAbortConfirmModal(false);
      }
    }

    async function confirmAbortBooking() {
      if (!selectedBooking) return;
      const btn = document.getElementById('btn-confirm-abort');
      btn.disabled = true;
      btn.textContent = 'Aborting...';

      try {
        // 1. Mark booking as cancelled (constraint-safe; fulfillment sync also picks this up)
        const { error: bookingErr } = await sb
          .from('installation_bookings')
          .update({ status: 'cancelled' })
          .eq('id', selectedBooking.id);
        if (bookingErr) throw bookingErr;

        // 2. Cancel all active inventory transactions for this order
        const orderNo = selectedBooking.order_no;
        if (orderNo) {
          const { data: txs, error: txFetchErr } = await sb
            .from('inventory_transactions')
            .select('id, sku, quantity, status, warehouse_id, timestamp_dispatched')
            .eq('reference_id', orderNo)
            .eq('type', 'customer_order')
            .in('status', ['inspect', 'reserved', 'packed', 'dispatched']);
          if (txFetchErr) throw txFetchErr;

          const hasDispatched = (txs || []).some(tx => tx.status === 'dispatched' || tx.timestamp_dispatched);
          if (!hasDispatched) {
            const { error: delBookingErr } = await sb
              .from('delivery_bookings')
              .delete()
              .eq('reference_id', orderNo);
            if (delBookingErr) throw delBookingErr;
          }

          const now = new Date().toISOString();
          for (const tx of (txs || []).filter(tx => !hasDispatched && tx.status !== 'dispatched')) {
            // Cancel the transaction
            const { error: txErr } = await sb
              .from('inventory_transactions')
              .update({ status: 'cancelled', timestamp_cancelled: now })
              .eq('id', tx.id);
            if (txErr) throw txErr;

            // Adjust inventory counts
            let invQ = sb.from('inventory').select('*').eq('sku', tx.sku);
            if (tx.warehouse_id) {
              invQ = invQ.eq('warehouse_id', tx.warehouse_id);
            } else {
              invQ = invQ.is('warehouse_id', null);
            }
            const { data: invRows, error: invErr } = await invQ;
            if (invErr) throw invErr;
            if (invRows && invRows.length > 0) {
              const inv = invRows[0];
              const invUpdate = { cancelled: (inv.cancelled || 0) + tx.quantity };
              if (tx.status === 'inspect') {
                invUpdate.inspect = Math.max(0, (inv.inspect || 0) - tx.quantity);
              } else if (tx.status === 'reserved') {
                invUpdate.reserved = Math.max(0, (inv.reserved || 0) - tx.quantity);
              } else if (tx.status === 'packed') {
                invUpdate.packed = Math.max(0, (inv.packed || 0) - tx.quantity);
              }
              const { error: updErr } = await sb
                .from('inventory')
                .update(invUpdate)
                .eq('id', inv.id);
              if (updErr) throw updErr;
            }
          }
        }

        // Update local state
        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].status = 'cancelled';
          selectedBooking.status = 'cancelled';
        }

        showToast('Booking aborted. Fulfillment items cancelled.');
        toggleAbortConfirmModal(false);
        toggleDetailsModal(false);
        applyFilterAndRender();
      } catch (err) {
        console.error(err);
        showToast('Failed to abort booking: ' + err.message, true);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Abort';
      }
    }

    // Day events modal actions
    function toggleDayEventsModal(show) {
      document.getElementById('day-events-modal').classList.toggle('open', show);
      if (!show) {
        hideCreateEventForm();
      }
    }

    function closeDayEventsModal(e) {
      if (e.target.id === 'day-events-modal') {
        toggleDayEventsModal(false);
      }
    }

    function handleDayClick(dateStr, event) {
      selectedDayDate = dateStr;
      
      // Update modal title with date
      document.getElementById('day-events-title-date').textContent = formatDateFriendly(dateStr);
      
      // Filter bookings for this day
      const dayBookings = dbBookings.filter(b => b.scheduled_date === dateStr);
      const dayReminders = calendarDayEvents.filter(dayEvent => dayEvent.date === dateStr);
      const listContainer = document.getElementById('day-events-list');
      
      if (dayBookings.length === 0 && dayReminders.length === 0) {
        listContainer.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 1.5rem 0;">No schedules</div>';
      } else {
        listContainer.innerHTML = '';
        dayBookings.forEach(b => {
          const isAborted = b.status === 'cancelled';
          const timeLabel = isAfternoon(b.scheduled_time) ? 'Afternoon (PM)' : 'Morning (AM)';
          const item = document.createElement('div');
          item.style.padding = '0.75rem';
          item.style.border = '1px solid var(--border)';
          item.style.borderRadius = '6px';
          item.style.background = 'var(--bg-surface)';
          item.style.cursor = 'pointer';
          item.style.display = 'flex';
          item.style.justifyContent = 'space-between';
          item.style.alignItems = 'center';
          item.onclick = () => {
            toggleDayEventsModal(false);
            showBookingDetails(b.id);
          };

          item.innerHTML = `
            <div>
              <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(b.customer_name)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${timeLabel}</div>
            </div>
            <div>
              ${isAborted ? '<span style="font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Aborted</span>' : ''}
            </div>
          `;
          listContainer.appendChild(item);
        });

        dayReminders.forEach(dayReminder => {
          const timeLabel = isAfternoon(dayReminder.timeSlot) ? 'Afternoon (PM)' : 'Morning (AM)';
          const installerNames = (dayReminder.installers || [])
            .map(installer => formatInstallerName(installer.name || ''))
            .filter(Boolean)
            .join(', ');
          const item = document.createElement('div');
          item.style.padding = '0.75rem';
          item.style.border = '1px solid rgba(239, 68, 68, 0.25)';
          item.style.borderRadius = '6px';
          item.style.background = 'rgba(239, 68, 68, 0.06)';
          item.innerHTML = `
            <div style="font-weight: 600; color: #b91c1c;">Day off</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${timeLabel}${installerNames ? ` · ${escapeHtml(installerNames)}` : ''}</div>
          `;
          listContainer.appendChild(item);
        });
      }
      
      // Populate installers list checkboxes
      populateInstallersChecklist();

      // Populate previous customers datalist
      populatePreviousCustomersDatalist();
      
      toggleDayEventsModal(true);
    }

    function populatePreviousCustomersDatalist() {
      const dl = document.getElementById('prev-customers-list');
      if (!dl) return;
      dl.innerHTML = '';
      
      const seen = new Set();
      const sorted = [...dbBookings].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      
      sorted.forEach(b => {
        if (b.customer_name && !seen.has(b.customer_name.trim().toLowerCase())) {
          seen.add(b.customer_name.trim().toLowerCase());
          const opt = document.createElement('option');
          opt.value = b.customer_name.trim();
          dl.appendChild(opt);
        }
      });
    }

    function populateInstallersChecklist() {
      const container = document.getElementById('event-installers-list');
      if (!container) return;
      container.innerHTML = '';

      const installerNames = window._installerAssignmentNames || [];
      const installers = dbEmployees.filter(emp => {
        if (String(emp.employment_status || 'Active').trim().toLowerCase() !== 'active') return false;
        const empAssigns = (emp.assignment || '').split(',').map(s => s.trim());
        const empAssignsLower = empAssigns.map(s => s.toLowerCase());
        if (installerNames.length > 0) {
          return empAssigns.some(a => installerNames.includes(a));
        }
        const title = (emp.title || emp.position || '').toLowerCase();
        return title.includes('installer') || title.includes('operations') || title.includes('field') || empAssignsLower.includes('installer');
      });

      if (installers.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem;">No installers found.</div>';
        return;
      }

      installers.forEach(inst => {
        const lastName = inst.last_name ? ` ${inst.last_name.trim()}` : '';
        const displayName = `${inst.first_name}${lastName}`;
        const checkboxId = `inst-check-${inst.id}`;

        const wrapper = document.createElement('label');
        wrapper.style.display = 'flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '0.5rem';
        wrapper.style.cursor = 'pointer';
        wrapper.style.fontSize = '0.85rem';
        wrapper.style.color = 'var(--text-primary)';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = inst.id;
        checkbox.id = checkboxId;
        checkbox.name = 'event-installers';
        checkbox.dataset.name = displayName;
        checkbox.style.cursor = 'pointer';

        wrapper.appendChild(checkbox);
        wrapper.appendChild(document.createTextNode(displayName));
        container.appendChild(wrapper);
      });
    }

    function showCreateEventForm() {
      document.getElementById('day-events-list-container').style.display = 'none';
      document.getElementById('day-events-create-form').style.display = 'flex';
      
      // Clear inputs
      document.getElementById('event-time-slot').value = 'Morning';
      
      // Uncheck all checkboxes
      const checkboxes = document.querySelectorAll('input[name="event-installers"]');
      checkboxes.forEach(cb => cb.checked = false);
    }

    function hideCreateEventForm() {
      document.getElementById('day-events-create-form').style.display = 'none';
      document.getElementById('day-events-list-container').style.display = 'block';
    }

    async function createDayEvent() {
      const timeSlot = document.getElementById('event-time-slot').value;
      
      // Collect selected installers
      const selectedCheckboxes = document.querySelectorAll('input[name="event-installers"]:checked');
      const installersList = [];
      selectedCheckboxes.forEach(cb => {
        installersList.push({
          id: cb.value,
          name: cb.dataset.name
        });
      });

      const selectVal = document.getElementById('event-type')?.value || 'Day-off';
      if (selectVal !== 'Day-off') return;
      if (installersList.length === 0) {
        showToast('Select at least one installer for the Day-off reminder.', true);
        return;
      }

      const eventDate = new Date(`${selectedDayDate}T00:00:00`);
      const settingKey = getDayEventSettingKey(eventDate.getFullYear(), eventDate.getMonth());

      try {
        const { data: currentSetting, error: loadError } = await sb
          .from('global_settings')
          .select('value')
          .eq('company_id', currentCompanyId)
          .eq('key', settingKey)
          .maybeSingle();

        if (loadError) throw loadError;

        const existingEvents = Array.isArray(currentSetting?.value) ? currentSetting.value : [];
        const dayEvent = {
          id: crypto.randomUUID(),
          type: 'day_off',
          date: selectedDayDate,
          timeSlot,
          installers: installersList,
          createdAt: new Date().toISOString()
        };
        const { error } = await sb.from('global_settings').upsert({
          company_id: currentCompanyId,
          key: settingKey,
          value: [...existingEvents, dayEvent],
          updated_at: new Date().toISOString()
        }, { onConflict: 'company_id,key' });

        if (error) throw error;

        showToast('Day-off reminder added to the calendar.');
        toggleDayEventsModal(false);
        await loadMonthBookings();
      } catch (err) {
        console.error('Failed to create event:', err);
        showToast('The Day-off reminder could not be saved. Please try again.', true);
      }
    }
