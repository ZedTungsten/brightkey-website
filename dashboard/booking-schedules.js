    'use strict';

    function compressImage(file, maxDimension = 1600, quality = 0.8) {
      return new Promise((resolve) => {
        if (!file.type.startsWith('image/') || file.size < 1024 * 1024) {
          resolve(file);
          return;
        }

        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
          URL.revokeObjectURL(img.src);
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          }, 'image/jpeg', quality);
        };
        img.onerror = () => {
          resolve(file);
        };
      });
    }

    let sb;
    let currentTenantId;
    let currentCompanyId;
    let dbBookings = [];
    let dbEmployees = [];
    let dbProducts = [];
    let bookingMediaRequirements = [];
    let bookingChecklist = [];
    let filteredBookings = [];
    let selectedBooking = null;
    let selectedDayDate = '';
    let searchQuery = '';
    let slotFiles = {};
    let otherFiles = [];
    let uploadDoorIndex = null;

    // Date state
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();

    let currentYear = todayYear;
    let currentMonth = todayMonth;

    const MONTH_NAMES = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    document.addEventListener("DOMContentLoaded", async () => {
      renderSkeletons();
      if (window.BKAuth) {
        const authInfo = await window.BKAuth.checkRoleGate(['Operations'], '../admin.html');
        if (!authInfo) return;
        sb = window.BKAuth.sb;
        currentTenantId = authInfo.tenantId;

        // Fetch company ID
        const { data: companyData, error: companyErr } = await sb
          .from('companies')
          .select('id')
          .eq('tenant_id', currentTenantId)
          .limit(1);

        if (companyErr) {
          showToast('Error loading company: ' + companyErr.message, true);
          return;
        }
        if (!companyData || companyData.length === 0) {
          showToast('No company config found.', true);
          return;
        }
        currentCompanyId = companyData[0].id;
      } else {
        showToast('Authentication module missing.', true);
        return;
      }

      const tbody = document.getElementById('all-bookings-tbody');
      if (tbody) {
        tbody.addEventListener('click', (e) => {
          const btn = e.target.closest('.btn-delete-booking');
          if (btn) {
            e.stopPropagation();
            const id = btn.dataset.id;
            if (id) deleteBookingFromDb(id);
            return;
          }
          const tr = e.target.closest('tr');
          if (tr) {
            const id = tr.dataset.id;
            if (id) showBookingDetails(id);
          }
        });
      }

      await loadData();
    });

    async function loadData() {
      renderSkeletons();
      try {
        // Fetch bookings matching company_id, employees, assignments, and products in parallel
        const [bookingsRes, employeesRes, assignmentsRes, productsRes] = await Promise.all([
          sb.from('installation_bookings').select('*').eq('company_id', currentCompanyId),
          sb.from('employees').select('id, employee_number, first_name, last_name, title, department, assignment'),
          sb.from('employee_assignments').select('id, name, visibility').eq('company_id', currentCompanyId || ''),
          sb.from('products').select('sku, category')
        ]);

        dbProducts = productsRes?.data || [];
        let data = bookingsRes.data;
        if (bookingsRes.error) {
          // Fallback if company_id column does not exist in this database instance yet
          if (bookingsRes.error.message && bookingsRes.error.message.includes('column') && bookingsRes.error.message.includes('company_id')) {
            console.warn('Fallback: company_id column missing on installation_bookings. Querying without filter.');
            const fallbackResult = await sb
              .from('installation_bookings')
              .select('*');
            if (fallbackResult.error) throw fallbackResult.error;
            data = fallbackResult.data;
          } else {
            throw bookingsRes.error;
          }
        }
        dbBookings = data || [];
        dbEmployees = employeesRes.data || [];
        
        // Fetch booking media requirements
        try {
          const { data: mediaReqsRes } = await sb
            .from('global_settings')
            .select('value')
            .eq('key', 'booking_media_requirements')
            .eq('company_id', currentCompanyId)
            .maybeSingle();

          if (mediaReqsRes && mediaReqsRes.value && Array.isArray(mediaReqsRes.value)) {
            bookingMediaRequirements = mediaReqsRes.value;
          } else {
            bookingMediaRequirements = [];
          }
          localStorage.setItem('bk_booking_media_requirements', JSON.stringify(bookingMediaRequirements));
        } catch (mediaErr) {
          console.error('Error loading media requirements:', mediaErr);
          const cachedMediaReqs = localStorage.getItem('bk_booking_media_requirements');
          if (cachedMediaReqs) {
            try { bookingMediaRequirements = JSON.parse(cachedMediaReqs); } catch(_) {}
          }
        }
        
        // Fetch booking checklist
        try {
          const { data: checklistSetting } = await sb
            .from('global_settings')
            .select('value')
            .eq('key', 'booking_checklist')
            .eq('company_id', currentCompanyId)
            .maybeSingle();

          if (checklistSetting && checklistSetting.value && Array.isArray(checklistSetting.value)) {
            bookingChecklist = checklistSetting.value;
          } else {
            bookingChecklist = [];
          }
          localStorage.setItem('bk_booking_checklist', JSON.stringify(bookingChecklist));
        } catch (checklistErr) {
          console.error('Error loading checklist:', checklistErr);
          const cachedChecklist = localStorage.getItem('bk_booking_checklist');
          if (cachedChecklist) {
            try { bookingChecklist = JSON.parse(cachedChecklist); } catch(_) {}
          }
        }
        
        window._installerAssignmentNames = (assignmentsRes.data || [])
          .filter(a => Array.isArray(a.visibility) && a.visibility.includes('booking.door_specifications'))
          .map(a => a.name);

        applyFilterAndRender();
      } catch (err) {
        console.error('Failed to load bookings:', err);
        showToast('Failed to load bookings: ' + err.message, true);
      }
    }

    function handleSearch() {
      searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
      applyFilterAndRender();
    }

    function applyFilterAndRender() {
      if (!searchQuery) {
        filteredBookings = [...dbBookings];
      } else {
        filteredBookings = dbBookings.filter(b => {
          const name = (b.customer_name || '').toLowerCase();
          const address = (b.customer_address || '').toLowerCase();
          const installer = (b.installer_name || '').toLowerCase();
          return name.includes(searchQuery) || address.includes(searchQuery) || installer.includes(searchQuery);
        });
      }

      // Sort filtered bookings by scheduled date and time (AM slot before PM slot)
      filteredBookings.sort((a, b) => {
        const dateA = a.scheduled_date || '9999-12-31';
        const dateB = b.scheduled_date || '9999-12-31';
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        const isPmA = isAfternoon(a.scheduled_time) ? 1 : 0;
        const isPmB = isAfternoon(b.scheduled_time) ? 1 : 0;
        return isPmA - isPmB;
      });

      drawCalendar();
      drawAllBookingsList();
    }

    function changeMonth(direction) {
      currentMonth += direction;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      drawCalendar();
      drawAllBookingsList();
    }

    window.switchMainTab = function(tab) {
      const tabSchedules = document.getElementById('tab-schedules');
      const tabAllBookings = document.getElementById('tab-all-bookings');
      
      const panelSchedules = document.getElementById('tab-panel-schedules');
      const panelAllBookings = document.getElementById('tab-panel-all-bookings');

      if (tab === 'schedules') {
        if (tabSchedules) tabSchedules.classList.add('active');
        if (tabAllBookings) tabAllBookings.classList.remove('active');
        if (panelSchedules) panelSchedules.style.display = 'block';
        if (panelAllBookings) panelAllBookings.style.display = 'none';
      } else {
        if (tabSchedules) tabSchedules.classList.remove('active');
        if (tabAllBookings) tabAllBookings.classList.add('active');
        if (panelSchedules) panelSchedules.style.display = 'none';
        if (panelAllBookings) panelAllBookings.style.display = 'block';
        drawAllBookingsList();
      }
    };

    function drawAllBookingsList() {
      const tbody = document.getElementById('all-bookings-tbody');
      if (!tbody) return;

      const yearStr = String(currentYear);
      const monthStr = String(currentMonth + 1).padStart(2, '0');
      const prefix = `${yearStr}-${monthStr}`;

      const bookingsInMonth = filteredBookings.filter(b => b.scheduled_date && b.scheduled_date.startsWith(prefix));

      if (bookingsInMonth.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 2rem 0;">No bookings found for the selected month.</td></tr>`;
        return;
      }

      tbody.innerHTML = bookingsInMonth.map(b => {
        const installDate = b.scheduled_date ? formatDateFriendly(b.scheduled_date) : 'Unscheduled';
        const name = escapeHtml(b.customer_name || '—');
        const orderNo = escapeHtml(b.order_no || '—');
        
        // City
        const addressParts = (b.customer_address || '').split(',');
        let city = '—';
        if (addressParts.length >= 2) {
          city = escapeHtml(addressParts[addressParts.length - 2].trim());
        } else if (b.customer_address) {
          city = escapeHtml(b.customer_address.trim());
        }

        // Group SKUs under name
        let skus = [];
        let qtys = [];
        if (b.product_skus) {
          skus = b.product_skus.split(' | ').map(s => s.trim());
        }
        if (b.product_qtys) {
          qtys = b.product_qtys.split(' | ').map(q => q.trim());
        }
        
        const skuHtml = skus.map(s => `<div style="font-weight: 600;">${escapeHtml(s)}</div>`).join('');
        const qtyHtml = qtys.map(q => `<div>${escapeHtml(q)}</div>`).join('');

        const deleteButton = `
          <button class="btn-minimal btn-danger btn-delete-booking" data-id="${b.id}" title="Delete Booking" style="display: inline-flex; align-items: center; justify-content: center; cursor: pointer;">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        `;

        return `
          <tr style="cursor: pointer;" data-id="${b.id}">
            <td>${installDate}</td>
            <td style="font-weight: 700; color: var(--text-primary);">${name}</td>
            <td><span class="order-no-pill">${orderNo}</span></td>
            <td>${city}</td>
            <td>${skuHtml}</td>
            <td style="text-align: center;">${qtyHtml}</td>
            <td style="text-align: center;">${deleteButton}</td>
          </tr>
        `;
      }).join('');
    }

    window.deleteBookingFromDb = async function(id) {
      if (!window.BKDialog) {
        if (!confirm('Are you sure you want to permanently delete this booking?')) return;
      } else {
        const ok = await window.BKDialog.ask({
          title: 'Delete Booking',
          message: 'Are you sure you want to permanently delete this booking? This will remove all associated installation details and cannot be undone.',
          okText: 'Yes, Delete',
          cancelText: 'Cancel'
        });
        if (!ok) return;
      }

      try {
        const { error } = await sb
          .from('installation_bookings')
          .delete()
          .eq('id', id);

        if (error) throw error;

        showToast('Booking deleted successfully.');
        await loadData();
      } catch (err) {
        console.error('Failed to delete booking:', err);
        showToast('Failed to delete booking: ' + err.message, true);
      }
    };

    function drawCalendar() {
      const title = document.getElementById('calendar-month-title');
      title.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

      const cellsContainer = document.getElementById('calendar-cells');
      cellsContainer.innerHTML = '';

      const firstDayDate = new Date(currentYear, currentMonth, 1);
      const firstDayIndex = firstDayDate.getDay();
      const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

      // Filler cells for previous month padding
      for (let i = 0; i < firstDayIndex; i++) {
        cellsContainer.insertAdjacentHTML('beforeend', `
          <div class="calendar-cell" style="background:#f9fafb; opacity:0.3;">
            <div class="calendar-cell-header"><span class="calendar-cell-num"></span></div>
            <div class="calendar-half am"></div>
            <div class="calendar-half pm"></div>
          </div>
        `);
      }

      // Populate days
      for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        
        // Filter bookings scheduled for this date (from our searched list)
        const dayBookings = filteredBookings.filter(b => b.scheduled_date === dateStr);

        let amHtml = '';
        let pmHtml = '';

        dayBookings.forEach(b => {
          // Parse city from address or fallback
          const cityStr = getCityFromAddress(b.customer_address);
          const alertIcon = (b.needs_work_permit && !b.work_permit_image_url) 
            ? ` <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left: 2px;"><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>` 
            : '';
          const displayText = `${escapeHtml(b.customer_name)} (${escapeHtml(cityStr)})${alertIcon}`;
          const isAborted = b.status === 'cancelled';
          
          let doorsArr = [];
          if (b.doors) {
            if (typeof b.doors === 'string') {
              try { doorsArr = JSON.parse(b.doors); } catch(_) {}
            } else if (Array.isArray(b.doors)) {
              doorsArr = b.doors;
            }
          }
          const isDone = doorsArr.length > 0 && doorsArr.every(d => d.completed);
          const hasCompleteMedia = doorsArr.length > 0 && doorsArr.every(d => {
            if (!bookingMediaRequirements || bookingMediaRequirements.length === 0) {
              return d.media_urls && d.media_urls.length > 0;
            }
            return bookingMediaRequirements.every(req => d.required_media && d.required_media[req.label]);
          });
          const isFullyDone = isDone && hasCompleteMedia;

          const badgeHtml = isAborted
            ? `<span style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Aborted</span>`
            : (isFullyDone 
                ? `<div style="display:flex; flex-direction:column; gap:2px; align-items:flex-start;">
                     <span class="calendar-inst-badge" style="background:#22C55E; color:#fff; border:none; font-size:0.6rem; margin-top:2px;">Done, Media Uploaded</span>
                     ${b.installer_name ? `<span class="calendar-inst-badge" style="background:#E4E4E7; color:#71717A; font-size:0.58rem; margin-top:1px;">${escapeHtml(formatInstallerName(b.installer_name))}</span>` : ''}
                   </div>`
                : (b.installer_name ? `<span class="calendar-inst-badge">${escapeHtml(formatInstallerName(b.installer_name))}</span>` : ''));

          const slotHtml = `
            <div class="calendar-slot ${isAfternoon(b.scheduled_time) ? 'pm' : 'am'}${isAborted ? ' aborted' : ''}${isFullyDone ? ' completed-media' : ''}" title="${escapeHtml(b.customer_name)} (${escapeHtml(cityStr)})" onclick="event.stopPropagation(); showBookingDetails('${b.id}')">
              <div style="font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%;">${displayText}</div>
              ${badgeHtml}
            </div>
          `;

          if (isAfternoon(b.scheduled_time)) {
            pmHtml += slotHtml;
          } else {
            amHtml += slotHtml;
          }
        });

        const isToday = (currentYear === todayYear && currentMonth === todayMonth && day === todayDay);
        const cellClass = isToday ? 'calendar-cell today' : 'calendar-cell';

        const cellHtml = `
          <div class="${cellClass}" onclick="handleDayClick('${dateStr}', event)">
            <div class="calendar-cell-header">
              <span class="calendar-cell-num">${day}</span>
            </div>
            <div class="calendar-half am">
              ${amHtml}
            </div>
            <div class="calendar-half pm">
              ${pmHtml}
            </div>
          </div>
        `;
        cellsContainer.insertAdjacentHTML('beforeend', cellHtml);
      }
    }



    function getCityFromAddress(address) {
      if (!address) return 'N/A';
      const parts = address.split(',');
      if (parts.length >= 2) {
        // Typically street, city, province. Let's return second to last or smart guess.
        // Let's clean and return the city/municipality
        return parts[parts.length - 2].trim();
      }
      return address;
    }

    function isAfternoon(timeStr) {
      if (!timeStr) return false;
      const lower = timeStr.toLowerCase();
      return lower.includes('pm') || lower.includes('afternoon');
    }

    function formatDateFriendly(dateStr) {
      const date = new Date(dateStr);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }

    // Modal helpers
    function navigateBooking(direction) {
      if (!selectedBooking || !filteredBookings || filteredBookings.length === 0) return;
      const currentIndex = filteredBookings.findIndex(b => b.id === selectedBooking.id);
      if (currentIndex === -1) return;

      let nextIndex = currentIndex + direction;
      if (nextIndex < 0) {
        nextIndex = filteredBookings.length - 1;
      } else if (nextIndex >= filteredBookings.length) {
        nextIndex = 0;
      }

      const nextBooking = filteredBookings[nextIndex];
      if (nextBooking) {
        showBookingDetails(nextBooking.id);
      }
    }

    async function showBookingDetails(id) {
      selectedBooking = dbBookings.find(b => b.id === id);
      if (!selectedBooking) return;

      toggleEditField('map-pin', false);
      toggleEditField('notes', false);

      // Show/hide abort button based on current status
      const isAborted = selectedBooking.status === 'cancelled';
      const abortBtn = document.getElementById('btn-abort-booking');
      const reschedBtn = document.getElementById('btn-reschedule-booking');
      if (abortBtn) abortBtn.style.display = isAborted ? 'none' : '';
      if (reschedBtn) reschedBtn.disabled = isAborted;

      document.getElementById('det-date').innerText = selectedBooking.scheduled_date ? formatDateFriendly(selectedBooking.scheduled_date) : 'Unscheduled';
      document.getElementById('det-time').innerText = selectedBooking.scheduled_time || 'AM Slot';
      document.getElementById('det-name').innerText = selectedBooking.customer_name || 'N/A';
      document.getElementById('det-contact').innerText = selectedBooking.customer_phone || selectedBooking.customer_email || 'N/A';
      document.getElementById('det-booked-date').innerText = selectedBooking.created_at ? formatDateFriendly(selectedBooking.created_at) : 'N/A';
      
      // City & Province
      const addressParts = (selectedBooking.customer_address || '').split(',');
      let city = 'N/A';
      let province = 'N/A';
      if (addressParts.length >= 2) {
        city = addressParts[addressParts.length - 2].trim();
        province = addressParts[addressParts.length - 1].trim();
      }
      document.getElementById('det-city').innerText = city;
      document.getElementById('det-province').innerText = province;
      document.getElementById('det-address').innerText = selectedBooking.customer_address || 'N/A';

      // Financials
      const grandTotalCents = selectedBooking.grand_total || 0;
      document.getElementById('det-total').innerText = (grandTotalCents / 100).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

      // View PDF — always available, regenerated from stored booking data
      const receiptEl = document.getElementById('det-receipt');
      receiptEl.innerHTML = `<a href="#" onclick="openViewReceipt().catch(console.error); return false;" style="color:var(--blue); font-weight:600;">Open Receipt</a>`;

      // Google Map Pin
      const mapPinEl = document.getElementById('det-map-pin');
      if (selectedBooking.google_map_pin_url) {
        mapPinEl.innerHTML = `<a href="${selectedBooking.google_map_pin_url}" target="_blank" style="color:var(--blue); font-weight:600;">Open Google Map Pin</a>`;
      } else {
        mapPinEl.innerText = 'No link provided';
      }

      // Notes
      document.getElementById('det-notes').innerText = selectedBooking.notes || 'No notes';

      // Products & Doors parsing
      const tbody = document.getElementById('det-products-tbody');
      tbody.innerHTML = '';

      let productsArr = [];
      if (typeof selectedBooking.products === 'string') {
        try { productsArr = JSON.parse(selectedBooking.products); } catch(_) {}
      } else if (Array.isArray(selectedBooking.products)) {
        productsArr = selectedBooking.products;
      }

      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }

      // Pipe arrays fallbacks if JSON arrays are empty
      const skus = (selectedBooking.product_skus || '').split(' | ');
      const names = (selectedBooking.product_names || '').split(' | ');
      
      // Check if any door has attached products (new style)
      const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);
      const isSingleDoorGrouping = (doorsArr.length === 1 && productsArr.length > 0);
      
      const renderedProductSkus = new Set();
      const skuOccurrenceCount = new Map();
      const rowCount = Math.max(productsArr.length, doorsArr.length, skus.length);

      if (rowCount === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No products found</td></tr>`;
      } else {
        // Step 1: Render door rows
        for (let i = 0; i < doorsArr.length; i++) {
          const door = doorsArr[i];
          
          // Get products for this door
          let doorProducts = [];
          if (anyDoorHasAttachedProducts) {
            const attachedSkus = door.products || [];
            doorProducts = [];
            attachedSkus.forEach(sku => {
              const matchingProds = productsArr.filter(p => p.sku === sku);
              const occurrenceIndex = skuOccurrenceCount.get(sku) || 0;
              const matchedProd = matchingProds[occurrenceIndex];
              if (matchedProd) {
                doorProducts.push(matchedProd);
              } else {
                doorProducts.push({ sku: sku, name: sku, title: sku });
              }
              skuOccurrenceCount.set(sku, occurrenceIndex + 1);
            });
            attachedSkus.forEach(s => renderedProductSkus.add(s));
          } else if (isSingleDoorGrouping) {
            doorProducts = productsArr.filter(p => p.sku !== 'ADD-ON LABOR');
            doorProducts.forEach(p => renderedProductSkus.add(p.sku));
          } else {
            // fallback: Map one-to-one
            if (productsArr[i]) {
              doorProducts = [productsArr[i]];
              renderedProductSkus.add(productsArr[i].sku);
            } else if (skus[i]) {
              const nameFallback = names[i] || skus[i];
              doorProducts = [{ sku: skus[i], name: nameFallback, title: nameFallback }];
              renderedProductSkus.add(skus[i]);
            }
          }

          // Build product cell content
          let productCellHtml = `<div style="font-weight: 800; color: var(--text-primary); margin-bottom: 0.4rem; font-size: 0.85rem;">Door ${i + 1}</div>`;
          
          if (doorProducts.length === 0) {
            productCellHtml += `<span style="color:var(--text-muted); font-size:0.75rem;">No products attached</span>`;
          } else {
            productCellHtml += doorProducts.map(p => {
              const isCancelled = p.cancelled || false;
              let title = p.name || p.title || p.sku || 'N/A';
              if (title.startsWith(p.sku + ' - ')) {
                title = title.substring(p.sku.length + 3);
              } else if (title.startsWith(p.sku + '-')) {
                title = title.substring(p.sku.length + 1);
              }
              return `
                <div style="margin-bottom: 0.25rem; ${isCancelled ? 'opacity: 0.55; text-decoration: line-through;' : ''}">
                  <strong>${escapeHtml(p.sku)}</strong> - <span style="color: var(--text-secondary);">${escapeHtml(title)}</span>
                  ${isCancelled ? '<span style="color:var(--danger);font-size:0.7rem;font-weight:700;text-transform:uppercase;margin-left:0.3rem;text-decoration:none;display:inline-block;">Cancelled</span>' : ''}
                </div>
              `;
            }).join('');
          }

          // Gallery strip / Installer uploads section
          const mediaUrlsList = (door && door.media_urls) || [];
          const mediaThumbs = mediaUrlsList.map(url => {
            const isVid = /\.(mp4|mov|webm)(\?|$)/i.test(url);
            if (isVid) {
              return `
                <div class="door-thumbnail" style="display:inline-flex; align-items:center; justify-content:center; background:#000; color:#fff; cursor:pointer; width:36px; height:36px; border-radius:4px; border:1px solid var(--border); vertical-align:middle; margin-right:4px;" onclick="openLightbox('${url}')" title="Play Video">
                  <svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;stroke:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
              `;
            } else {
              return `
                <img class="door-thumbnail" src="${url}" alt="Installer Media" onclick="openLightbox('${url}')" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid var(--border); vertical-align:middle; margin-right:4px; cursor:pointer;" />
              `;
            }
          }).join('');

          const installerMediaStripHtml = `
            <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.15rem;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.2rem;">
                <span style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Installer Uploads</span>
                <button type="button" class="btn-minimal" onclick="openUploadModal(${i})" title="Edit Installer Uploads">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
              </div>
              ${mediaThumbs ? `<div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">${mediaThumbs}</div>` : `<span style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">No uploads yet</span>`}
            </div>
          `;
          productCellHtml += installerMediaStripHtml;

          if (door && door.signature) {
            const signatureHtml = `
              <div style="margin-top: 0.6rem; display: flex; flex-direction: column; gap: 0.15rem;">
                <span style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Customer Signature</span>
                <img src="${door.signature}" alt="Customer Signature" style="max-height: 40px; width: auto; align-self: flex-start; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;" onclick="openChecklistModal(${i})" />
              </div>
            `;
            productCellHtml += signatureHtml;
          }

          // Door type html
          const doorMaterial = door?.doorMaterial || 'N/A';
          const jambMaterial = door?.jambMaterial || 'N/A';
          let swing = door?.swing || 'N/A';
          if (swing !== 'N/A') {
            swing = swing.replace(/swing/gi, '').trim();
          }
          const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : 'N/A';
          const doorTypeHtml = (doorMaterial !== 'N/A' || jambMaterial !== 'N/A') ? 
            `Door: ${escapeHtml(cap(doorMaterial))}<br/>Jamb: ${escapeHtml(cap(jambMaterial))}<br/><span style="color:var(--text-muted);font-size:0.75rem;">Swing: ${escapeHtml(cap(swing))}</span>` 
            : 'N/A';

          // Door photos thumbnails
          const photos = door?.photos || [];
          let thumbs = 'No pics';
          if (photos.length > 0) {
            thumbs = photos.map(url => `
              <img class="door-thumbnail" src="${url}" alt="Door Pic" onclick="openLightbox('${url}')" style="margin: 0;" />
            `).join('');
          }
          const photosHtml = `
            <div id="door-pics-container-${i}">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-width: 110px;">
                <div id="door-pics-list-${i}" style="display: grid; grid-template-columns: repeat(2, 44px); gap: 4px; align-items: center;">${thumbs}</div>
                <button type="button" class="btn-minimal" onclick="editDoorPics(${i})" title="Edit Door Pics" style="margin-left: auto;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
              </div>
            </div>
          `;

          const allProductsCancelled = doorProducts.length > 0 && doorProducts.every(p => p.cancelled);

          // Installers assigned to this door — show with role labels if available
          let installersHtml = 'None Assigned';
          if (allProductsCancelled) {
            installersHtml = 'N/A';
          } else if (door && Array.isArray(door.installers)) {
            if (door.installers.length > 0) {
               installersHtml = door.installers.map(inst => {
                 const roleText = inst.role ? inst.role.charAt(0).toUpperCase() + inst.role.slice(1) : '';
                 const role = roleText ? `<span style="font-size:0.65rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-right:0.2rem;">${escapeHtml(roleText)}:</span>` : '';
                 return role + escapeHtml(formatInstallerName(inst.name));
               }).join(', ');
            } else {
              installersHtml = 'None Assigned';
            }
          } else if (selectedBooking.installers && selectedBooking.installers.length > 0) {
            let list = [];
            if (typeof selectedBooking.installers === 'string') {
              try { list = JSON.parse(selectedBooking.installers); } catch(_) {}
            } else {
              list = selectedBooking.installers;
            }
            if (list.length > 0) {
              installersHtml = list.map(inst => {
                const role = inst.role ? `<span style="font-size:0.65rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-right:0.2rem;">${escapeHtml(inst.role)}:</span>` : '';
                return role + escapeHtml(formatInstallerName(inst.name));
              }).join(', ');
            }
          } else if (selectedBooking.installer_name) {
            installersHtml = escapeHtml(formatInstallerName(selectedBooking.installer_name));
          }

          const trStyle = allProductsCancelled ? 'style="opacity: 0.55; background-color: rgba(244, 244, 245, 0.4);"' : '';

          tbody.insertAdjacentHTML('beforeend', `
            <tr ${trStyle}>
              <td>${productCellHtml}</td>
              <td>${doorTypeHtml}</td>
              <td>${photosHtml}</td>
              <td>
                <div id="door-inst-container-${i}">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                    <span id="door-inst-text-${i}">${installersHtml}</span>
                    ${allProductsCancelled ? '' : `
                    <button type="button" class="btn-minimal" onclick="editDoorInstallers(${i})" title="Edit Installers">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    `}
                  </div>
                </div>
              </td>
            </tr>
          `);
        }

        // Step 2: Render remaining/unattached products (accessories, add-on labor, etc.)
        const unattachedProducts = productsArr.filter(p => !renderedProductSkus.has(p.sku));
        const unattachedSkus = skus.filter(sku => !renderedProductSkus.has(sku));
        
        const extraCount = Math.max(unattachedProducts.length, unattachedSkus.length);

        for (let i = 0; i < extraCount; i++) {
          const p = unattachedProducts[i];
          const sku = p?.sku || unattachedSkus[i] || 'N/A';
          let title = p?.name || p?.title || 'N/A';
          if (title === 'N/A') {
            const idx = skus.indexOf(sku);
            if (idx !== -1) title = names[idx] || sku;
          }
          
          if (title.startsWith(sku + ' - ')) {
            title = title.substring(sku.length + 3);
          } else if (title.startsWith(sku + '-')) {
            title = title.substring(sku.length + 1);
          }

          const isCancelled = p?.cancelled || false;
          const trStyle = isCancelled ? 'style="opacity: 0.55; background-color: rgba(244, 244, 245, 0.4);"' : '';

          let generalInstallersHtml = 'None Assigned';
          if (selectedBooking.installers && selectedBooking.installers.length > 0) {
            let list = [];
            if (typeof selectedBooking.installers === 'string') {
              try { list = JSON.parse(selectedBooking.installers); } catch(_) {}
            } else {
              list = selectedBooking.installers;
            }
            if (list.length > 0) {
              generalInstallersHtml = list.map(inst => formatInstallerName(inst.name)).join(', ');
            }
          } else if (selectedBooking.installer_name) {
            generalInstallersHtml = formatInstallerName(selectedBooking.installer_name);
          }

          tbody.insertAdjacentHTML('beforeend', `
            <tr ${trStyle}>
              <td>
                <strong>${escapeHtml(sku)}</strong> - <span style="color: var(--text-secondary);">${escapeHtml(title)}</span>
                ${isCancelled ? '<br/><span style="color:var(--danger);font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Cancelled</span>' : ''}
              </td>
              <td>N/A</td>
              <td>N/A</td>
              <td>${escapeHtml(generalInstallersHtml)}</td>
            </tr>
          `);
        }
      }

      updateFrontageUI();
      updateMapUI();

      // Work permit UI state helper
      updateWorkPermitUI();

      toggleDetailsModal(true);
    }

    function updateWorkPermitUI() {
      if (!selectedBooking) return;
      const uploadContainer = document.getElementById('upload-work-permit-container');
      const previewContainer = document.getElementById('preview-work-permit-container');
      const imgElement = document.getElementById('img-work-permit');
      const wpCard = document.getElementById('card-work-permit');
      
      if (selectedBooking.work_permit_image_url) {
        uploadContainer.style.display = 'none';
        previewContainer.style.display = 'block';
        imgElement.src = selectedBooking.work_permit_image_url;
      } else {
        uploadContainer.style.display = 'flex';
        previewContainer.style.display = 'none';
        imgElement.src = '';
      }

      if (wpCard) {
        if (selectedBooking.needs_work_permit && !selectedBooking.work_permit_image_url) {
          wpCard.style.border = '2px solid #DC2626';
          wpCard.style.boxShadow = '0 0 8px rgba(220, 38, 38, 0.2)';
        } else {
          wpCard.style.border = '';
          wpCard.style.boxShadow = '';
        }
      }
    }

    function updateFrontageUI() {
      if (!selectedBooking) return;
      const uploadContainer = document.getElementById('upload-frontage-container');
      const previewContainer = document.getElementById('preview-frontage-container');
      const imgElement = document.getElementById('img-frontage');
      
      if (selectedBooking.frontage_image_url) {
        uploadContainer.style.display = 'none';
        previewContainer.style.display = 'block';
        imgElement.src = selectedBooking.frontage_image_url;
      } else {
        uploadContainer.style.display = 'flex';
        previewContainer.style.display = 'none';
        imgElement.src = '';
      }
    }

    function updateMapUI() {
      if (!selectedBooking) return;
      const uploadContainer = document.getElementById('upload-map-container');
      const previewContainer = document.getElementById('preview-map-container');
      const imgElement = document.getElementById('img-map');
      
      if (selectedBooking.map_image_url) {
        uploadContainer.style.display = 'none';
        previewContainer.style.display = 'block';
        imgElement.src = selectedBooking.map_image_url;
      } else {
        uploadContainer.style.display = 'flex';
        previewContainer.style.display = 'none';
        imgElement.src = '';
      }
    }

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

    window.toggleEditField = function(field, show) {
      if (field === 'map-pin') {
        document.getElementById('det-map-pin').style.display = show ? 'none' : 'inline';
        document.getElementById('btn-edit-map-pin').style.display = show ? 'none' : 'inline-flex';
        document.getElementById('edit-container-map-pin').style.display = show ? 'flex' : 'none';
        if (show) {
          document.getElementById('input-map-pin').value = selectedBooking.google_map_pin_url || '';
        }
      } else if (field === 'notes') {
        document.getElementById('det-notes').style.display = show ? 'none' : 'inline';
        document.getElementById('btn-edit-notes').style.display = show ? 'none' : 'inline-flex';
        document.getElementById('edit-container-notes').style.display = show ? 'flex' : 'none';
        if (show) {
          document.getElementById('input-notes').value = selectedBooking.notes || '';
        }
      }
    };

    window.saveInlineEdit = async function(field) {
      if (!selectedBooking) return;

      let updatePayload = {};
      let newValue = '';

      if (field === 'map-pin') {
        newValue = document.getElementById('input-map-pin').value.trim();
        updatePayload.google_map_pin_url = newValue || null;
      } else if (field === 'notes') {
        newValue = document.getElementById('input-notes').value.trim();
        updatePayload.notes = newValue || null;
      }

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update(updatePayload)
          .eq('id', selectedBooking.id);

        if (error) throw error;

        // Update local memory
        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          if (field === 'map-pin') {
            dbBookings[bookingIndex].google_map_pin_url = newValue || null;
            selectedBooking.google_map_pin_url = newValue || null;
          } else if (field === 'notes') {
            dbBookings[bookingIndex].notes = newValue || null;
            selectedBooking.notes = newValue || null;
          }
        }

        showToast('Saved successfully!');
        
        // Refresh detail view display
        if (field === 'map-pin') {
          const mapPinEl = document.getElementById('det-map-pin');
          if (newValue) {
            mapPinEl.innerHTML = `<a href="${newValue}" target="_blank" style="color:var(--blue); font-weight:600;">Open Google Map Pin</a>`;
          } else {
            mapPinEl.innerText = 'No link provided';
          }
        } else if (field === 'notes') {
          document.getElementById('det-notes').innerText = newValue || 'No notes';
        }

        toggleEditField(field, false);
        applyFilterAndRender();
      } catch (err) {
        console.error(err);
        showToast('Failed to save changes: ' + err.message, true);
      }
    };

    function toggleDetailsModal(show) {
      document.getElementById('details-modal').classList.toggle('open', show);
    }

    function closeDetailsModal(e) {
      if (e.target.id === 'details-modal') {
        toggleDetailsModal(false);
      }
    }

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
          // Delete delivery booking if it exists
          const { error: delBookingErr } = await sb
            .from('delivery_bookings')
            .delete()
            .eq('reference_id', orderNo);
          if (delBookingErr) throw delBookingErr;

          const { data: txs, error: txFetchErr } = await sb
            .from('inventory_transactions')
            .select('id, sku, quantity, status, warehouse_id')
            .eq('reference_id', orderNo)
            .eq('type', 'customer_order')
            .in('status', ['inspect', 'reserved', 'packed', 'dispatched']);
          if (txFetchErr) throw txFetchErr;

          const now = new Date().toISOString();
          for (const tx of (txs || [])) {
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
              } else if (tx.status === 'dispatched') {
                invUpdate.dispatched = Math.max(0, (inv.dispatched || 0) - tx.quantity);
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
      const listContainer = document.getElementById('day-events-list');
      
      if (dayBookings.length === 0) {
        listContainer.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 1.5rem 0;">No bookings</div>';
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
        if (installerNames.length > 0) {
          return emp.assignment && installerNames.includes(emp.assignment);
        }
        const title = (emp.title || emp.position || '').toLowerCase();
        const assignment = (emp.assignment || '').toLowerCase();
        return title.includes('installer') || title.includes('operations') || title.includes('field') || assignment.includes('installer');
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
      document.getElementById('event-cust-name').value = '';
      document.getElementById('event-time-slot').value = 'Morning';
      document.getElementById('event-type').value = 'backjob';
      
      // Uncheck all checkboxes
      const checkboxes = document.querySelectorAll('input[name="event-installers"]');
      checkboxes.forEach(cb => cb.checked = false);
    }

    function hideCreateEventForm() {
      document.getElementById('day-events-create-form').style.display = 'none';
      document.getElementById('day-events-list-container').style.display = 'block';
    }

    async function createDayEvent() {
      const nameInput = document.getElementById('event-cust-name');
      const customerName = nameInput.value.trim();
      if (!customerName) {
        showToast('Please enter a Customer Name.', true);
        nameInput.focus();
        return;
      }

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

      const installerIdStr = installersList.length > 0 ? installersList.map(i => i.id).join(' | ') : null;
      const installerNameStr = installersList.length > 0 ? installersList.map(i => i.name).join(' | ') : null;

      const eventType = document.getElementById('event-type').value;
      const eventTypeName = eventType === 'ocular' ? 'Ocular' : 'Backjob';
      const typePrefix = eventType === 'ocular' ? 'OC' : 'BJ';

      // Find matched previous customer to copy details from
      const sorted = [...dbBookings].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      const matched = sorted.find(b => b.customer_name && b.customer_name.trim().toLowerCase() === customerName.toLowerCase());

      const randomSuffix = Date.now();
      const folderRefId = `${typePrefix}-${randomSuffix}`;
      const orderNo = `${typePrefix}-${randomSuffix}`;

      // Product details mapping
      const installerNamesList = installersList.map(i => formatInstallerName(i.name));
      const installerNamesJoined = installerNamesList.join(', ');
      const productName = installerNamesJoined ? `${eventTypeName} - ${installerNamesJoined}` : eventTypeName;

      const payload = {
        company_id: currentCompanyId,
        folder_ref_id: folderRefId,
        order_no: orderNo,
        customer_name: customerName,
        customer_address: matched ? (matched.customer_address || eventTypeName) : eventTypeName,
        customer_social: matched ? matched.customer_social : null,
        customer_email: matched ? matched.customer_email : null,
        customer_phone: matched ? matched.customer_phone : null,
        google_map_pin_url: matched ? matched.google_map_pin_url : null,
        scheduled_date: selectedDayDate,
        scheduled_time: timeSlot,
        installer_id: installerIdStr,
        installer_name: installerNameStr,
        installers: installersList,
        status: 'scheduled',
        grand_total: 0,
        subtotal: 0,
        product_skus: eventTypeName,
        product_names: productName,
        product_qtys: '1',
        product_unit_prices: '0',
        product_totals: '0',
        products: [{
          sku: eventTypeName,
          name: productName,
          quantity: 1,
          price: 0,
          total: 0
        }],
        doors: []
      };

      try {
        const { error } = await sb
          .from('installation_bookings')
          .insert([payload]);

        if (error) throw error;

        showToast(`${eventTypeName} created successfully.`);
        toggleDayEventsModal(false);
        await loadData();
      } catch (err) {
        console.error('Failed to create event:', err);
        showToast('Failed to create event: ' + err.message, true);
      }
    }

    // Open receipt using the saved invoice_template as single source of truth
    async function openViewReceipt() {
      if (!selectedBooking) return;
      const b = selectedBooking;

      const pipe = (str) => str ? str.split('|').map(s => s.trim()).filter(Boolean) : [];
      const esc  = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      const fmtPHP = (v) => `₱ ${parseFloat(v||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`;
      const fmtCents = (c) => `₱ ${((c||0)/100).toLocaleString('en-PH',{minimumFractionDigits:2})}`;

      // Fetch company invoice_template config (single source of truth)
      let cfg = {};
      try {
        const { data: setting } = await sb
          .from('global_settings')
          .select('value')
          .eq('key', 'invoice_template')
          .eq('company_id', currentCompanyId)
          .maybeSingle();
        if (setting && setting.value) cfg = setting.value;
      } catch(e) { console.warn('Could not load invoice template config:', e); }

      // Build items rows (one per product)
      const skus   = pipe(b.product_skus);
      const names  = pipe(b.product_names);
      const qtys   = pipe(b.product_qtys);
      const prices = pipe(b.product_unit_prices);
      const totals = pipe(b.product_totals);
      let itemsHtml = '';
      const rowCount = Math.max(skus.length, names.length, qtys.length);
      for (let i = 0; i < rowCount; i++) {
        const sku  = (skus[i]  || '').trim();
        const name = (names[i] || '').trim();
        let particulars;
        if (!name || name === sku)                           particulars = esc(sku);
        else if (name.startsWith(sku + ' - ') || name.startsWith(sku + '-')) particulars = esc(name);
        else                                                  particulars = esc(sku ? `${sku} - ${name}` : name);
        itemsHtml += `<tr>
          <td>${particulars}</td>
          <td align="right">${fmtPHP(prices[i] || 0)}</td>
          <td align="center">${esc(qtys[i] || 1)}</td>
          <td align="right">${fmtPHP(totals[i] || 0)}</td>
        </tr>`;
      }
      if (!itemsHtml) itemsHtml = `<tr><td colspan="4" align="center" style="color:#aaa;padding:1.5rem 0;">No items</td></tr>`;

      // Build charges / deductions rows
      const cLabels = pipe(b.charge_labels);
      const cVals   = pipe(b.charge_values);
      let chargesHtml = '';
      if (cLabels.length > 0 && cVals.some(v => parseFloat(v) > 0)) {
        chargesHtml = `<tr class="others-row">
          <td align="right" class="summary-label move-right">OTHERS:</td>
          <td class="summary-middle">${cLabels.map(esc).join('<br>')}</td>
          <td align="right" class="summary-value">${cVals.map(fmtPHP).join('<br>')}</td>
        </tr>`;
      }
      const dLabels = pipe(b.deduction_labels);
      const dVals   = pipe(b.deduction_values);
      let deductionsHtml = '';
      if (dLabels.length > 0 && dVals.some(v => parseFloat(v) > 0)) {
        deductionsHtml = `<tr class="less-row">
          <td align="right" class="summary-label move-right">LESS:</td>
          <td class="summary-middle">${dLabels.map(esc).join('<br>')}</td>
          <td align="right" class="summary-value">${dVals.map(v => `-₱ ${parseFloat(v).toLocaleString('en-PH',{minimumFractionDigits:2})}`).join('<br>')}</td>
        </tr>`;
      }

      // Terms HTML from config
      const terms = Array.isArray(cfg.terms) ? cfg.terms.filter(Boolean) : [];
      const termsHtml = terms.length > 0
        ? terms.map(t => {
            if (t.includes(':')) { const [l,...r]=t.split(':'); return `<div class="term-line"><strong>${esc(l)}:</strong>${esc(r.join(':'))}</div>`; }
            return `<div class="term-line">${esc(t)}</div>`;
          }).join('')
        : '<div class="term-line">No special terms specified.</div>';

      const receiptDate = b.scheduled_date
        ? new Date(b.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' })
        : new Date().toLocaleDateString('en-US', { month:'long', day:'numeric', year:'numeric' });

      const orderNo = esc(b.order_no || '');

      const w = window.open('', '_blank');

      if (cfg.template) {
        let html = cfg.template;
        // Config substitutions
        html = html.replace(/\{\{headerColor1\}\}/g, cfg.headerColor1 || '#454545');
        html = html.replace(/\{\{headerColor2\}\}/g, cfg.headerColor2 || '#2d2d2d');
        html = html.replace(/\{\{textColor\}\}/g,    cfg.textColor    || '#575757');
        html = html.replace(/\{\{lineColor\}\}/g,    cfg.lineColor    || '#9a9a9a');
        html = html.replace(/\{\{logo\}\}/g,         cfg.logo         || '../assets/og-image.png');
        html = html.replace(/\{\{companyName\}\}/g,  cfg.companyName  || 'Company Name');
        html = html.replace(/\{\{companyAddress\}\}/g, (cfg.companyAddress || '').replace(/\n/g, '<br>'));
        html = html.replace(/\{\{companyEmail\}\}/g, cfg.companyEmail || '');
        html = html.replace(/\{\{thankYouText\}\}/g, cfg.thankYouText || 'THANK YOU FOR YOUR BUSINESS!');
        // Data substitutions
        html = html.replace(/\{\{orderno\}\}/g,     orderNo);
        html = html.replace(/\{\{fullname\}\}/g,    esc(b.customer_name));
        html = html.replace(/\{\{contact\}\}/g,     esc(b.customer_phone || b.customer_email || 'n/a'));
        html = html.replace(/\{\{email\}\}/g,       esc(b.customer_email || 'n/a'));
        html = html.replace(/\{\{address\}\}/g,     esc(b.customer_address));
        html = html.replace(/\{\{datetoday\}\}/g,   receiptDate);
        html = html.replace(/\{\{items\}\}/g,       itemsHtml);
        html = html.replace(/\{\{itemtotal\}\}/g,   fmtCents(b.subtotal));
        html = html.replace(/\{\{addcharge\}\}/g,   chargesHtml);
        html = html.replace(/\{\{deduct\}\}/g,      deductionsHtml);
        html = html.replace(/\{\{grandtotall\}\}/g, fmtCents(b.grand_total));
        html = html.replace(/\{\{terms\}\}/g,       termsHtml);
        // Inject html2pdf + action buttons before </body>
        const actionScript = `
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
  <style>
    .receipt-actions{display:flex;justify-content:center;gap:12px;margin:30px auto;max-width:794px;padding:0 20px;font-family:"Inter",sans-serif;}
    .action-btn{padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;border:none;transition:all 0.2s;display:inline-flex;align-items:center;gap:8px;}
    .action-btn.btn-save{background:#2563eb;color:white;}.action-btn.btn-save:hover{background:#1d4ed8;}
    .action-btn.btn-print{background:#4b5563;color:white;}.action-btn.btn-print:hover{background:#374151;}
    @media print{.receipt-actions{display:none!important;}}
  </style>
  <div class="receipt-actions">
    <button class="action-btn btn-save" onclick="saveAsPdf()"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Save as PDF</button>
    <button class="action-btn btn-print" onclick="window.print()"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print Receipt</button>
  </div>
  <script>
    async function saveAsPdf() {
      const el = document.querySelector('.receipt-page');
      const wr = document.querySelector('.receipt-preview-wrapper');
      if (wr) { wr.style.padding='0'; wr.style.background='#ffffff'; }
      if (el) { el.style.margin='0'; }
      const btn = document.querySelector('.btn-save');
      const orig = btn.innerHTML; btn.innerHTML='⌛ Compiling...'; btn.disabled=true;
      try {
        await html2pdf().set({
          margin:[0,-1.3,0,1.3], filename:'${orderNo}.pdf',
          image:{type:'jpeg',quality:0.98},
          html2canvas:{scale:2,useCORS:true,scrollY:0},
          jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}
        }).from(el).save();
      } catch(e){console.error(e);} finally {
        if (wr) { wr.style.padding=''; wr.style.background=''; }
        if (el) { el.style.margin=''; }
        btn.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><polyline points="20 6 9 17 4 12"/></svg>Saved';
        setTimeout(()=>{btn.innerHTML=orig;btn.disabled=false;},3000);
      }
    }
  <\/script>`;
        html = html.replace('</body>', actionScript + '\n</body>');
        if (w) { w.document.open(); w.document.write(html); w.document.close(); }
      } else {
        if (w) {
          w.document.write(`<!DOCTYPE html><html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:1rem;"><h2>Receipt Template Not Configured</h2><p>Go to <a href="/dashboard/orders-invoices">Dashboard → Orders & Invoices</a> and click <strong>Save Template Settings</strong>.</p></body></html>`);
          w.document.close();
        }
      }
    }

        // Lightbox actions
    function openLightbox(src) {
      const modal = document.getElementById('lightbox-modal');
      const img = document.getElementById('lightbox-img');
      const vid = document.getElementById('lightbox-video');
      
      const isVid = /\.(mp4|mov|webm)(\?|$)/i.test(src);
      if (isVid) {
        img.style.display = 'none';
        img.src = '';
        vid.src = src;
        vid.style.display = 'block';
      } else {
        vid.style.display = 'none';
        vid.src = '';
        img.src = src;
        img.style.display = 'block';
      }
      modal.classList.add('open');
    }

    function closeLightbox() {
      const modal = document.getElementById('lightbox-modal');
      modal.classList.remove('open');
      const vid = document.getElementById('lightbox-video');
      if (vid) {
        vid.pause();
        vid.src = '';
      }
    }

    // Toast and HTML Helpers
    function showToast(msg, isError = false) {
      const container = document.getElementById('toast-container');
      if (!container) return;
      const el = document.createElement('div');
      el.className = `toast toast-${isError ? 'error' : 'success'}`;
      el.innerText = msg;
      container.appendChild(el);
      setTimeout(() => el.remove(), 3500);
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
    }

    function formatInstallerName(nameStr) {
      if (!nameStr) return 'None Assigned';
      const delimiter = nameStr.includes('|') ? '|' : (nameStr.includes(',') ? ',' : null);
      if (delimiter) {
        return nameStr.split(delimiter)
          .map(n => formatInstallerName(n.trim()))
          .filter(Boolean)
          .join(', ');
      }
      let cleaned = nameStr.replace(/\s*\([^)]*\)/g, '').trim();
      if (!cleaned) return '';
      const parts = cleaned.split(/\s+/);
      if (parts.length <= 1) return cleaned;
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];
      const initial = lastName ? ` ${lastName.charAt(0).toUpperCase()}.` : '';
      return `${firstName}${initial}`;
    }

    function renderSkeletons() {
      // Set correct month title immediately so it never shows a stale hardcoded value
      const titleEl = document.getElementById('calendar-month-title');
      if (titleEl) titleEl.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

      // 1. Render Calendar Skeletons
      const cellsContainer = document.getElementById('calendar-cells');
      if (cellsContainer) {
        cellsContainer.innerHTML = '';
        for (let i = 0; i < 35; i++) {
          const hasSlot1 = (i % 7 === 1 || i % 7 === 4);
          const hasSlot2 = (i % 7 === 4);
          const slotsHtml = `
            <div class="calendar-half am">
              ${hasSlot1 ? '<div class="skeleton skeleton-slot"></div>' : ''}
            </div>
            <div class="calendar-half pm">
              ${hasSlot2 ? '<div class="skeleton skeleton-slot"></div>' : ''}
            </div>
          `;
          cellsContainer.insertAdjacentHTML('beforeend', `
            <div class="calendar-cell" style="opacity: 0.6;">
              <div class="calendar-cell-header"><span class="calendar-cell-num">${i + 1 <= 30 ? i + 1 : ''}</span></div>
              ${slotsHtml}
            </div>
          `);
        }
      }

      // 2. Render List Skeletons
      const listContainer = document.getElementById('list-schedules-container');
      if (listContainer) {
        listContainer.innerHTML = '';
        for (let i = 0; i < 4; i++) {
          listContainer.insertAdjacentHTML('beforeend', `
            <div class="skeleton-card">
              <div class="skeleton-card-left">
                <div class="skeleton skeleton-name"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text-short"></div>
              </div>
              <div class="skeleton-card-right">
                <div class="skeleton skeleton-date"></div>
                <div class="skeleton skeleton-time"></div>
              </div>
            </div>
          `);
        }
      }
    }

    // Build <option> HTML for door installer dropdowns
    function buildDoorInstallerOptions(selectedId = '') {
      const installerNames = window._installerAssignmentNames || [];
      const installers = dbEmployees.filter(emp => {
        // Filter by assignment if assignments are configured
        if (installerNames.length > 0) {
          return emp.assignment && installerNames.includes(emp.assignment);
        }
        // Fallback: title/position/assignment-based filter for when assignments aren't set up yet
        const title = (emp.title || emp.position || '').toLowerCase();
        const assignment = (emp.assignment || '').toLowerCase();
        return title.includes('installer') || title.includes('operations') || title.includes('field') || assignment.includes('installer');
      });
      let html = '<option value="">-- Unassigned --</option>';
      installers.forEach(inst => {
        const lastName = inst.last_name ? ` ${inst.last_name.trim()}` : '';
        const displayName = `${inst.first_name}${lastName}`;
        const sel = inst.id === selectedId ? 'selected' : '';
        html += `<option value="${inst.id}" ${sel}>${displayName}</option>`;
      });
      return html;
    }

    window.editDoorInstallers = function(doorIndex) {
      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }
      
      const door = doorsArr[doorIndex];
      if (!door) return;

      const currentInstallers = door.installers || [];
      const leadInst  = currentInstallers.find(i => i.role === 'lead') || currentInstallers[0];
      const assistInsts = currentInstallers.filter(i => i.role === 'assist');
      const serviceInst = currentInstallers.find(i => i.role === 'service');
      
      // Fallback for old data without roles: treat index 1+ as assist
      const inst1Id  = leadInst?.id || '';
      const inst2Id  = assistInsts[0]?.id || (currentInstallers[1]?.id || '');
      const inst3Id  = assistInsts[1]?.id || (currentInstallers[2]?.id || '');
      const hasAssist2 = !!inst2Id;
      const hasAssist3 = !!inst3Id;

      let productsArr = [];
      if (typeof selectedBooking.products === 'string') {
        try { productsArr = JSON.parse(selectedBooking.products); } catch(_) {}
      } else if (Array.isArray(selectedBooking.products)) {
        productsArr = selectedBooking.products;
      }

      let skus = [];
      if (selectedBooking.sku) {
        skus = selectedBooking.sku.split(' | ');
      }
      let names = [];
      if (selectedBooking.product_name) {
        names = selectedBooking.product_name.split(' | ');
      }

      const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);
      const isSingleDoorGrouping = (doorsArr.length === 1 && productsArr.length > 0);

      let doorProducts = [];
      if (anyDoorHasAttachedProducts) {
        const attachedSkus = door.products || [];
        doorProducts = productsArr.filter(p => attachedSkus.includes(p.sku));
      } else if (isSingleDoorGrouping) {
        doorProducts = productsArr.filter(p => p.sku !== 'ADD-ON LABOR');
      } else {
        if (productsArr[doorIndex]) {
          doorProducts = [productsArr[doorIndex]];
        } else if (skus[doorIndex]) {
          const nameFallback = names[doorIndex] || skus[doorIndex];
          doorProducts = [{ sku: skus[doorIndex], name: nameFallback, title: nameFallback }];
        }
      }

      const hasServiceProduct = doorProducts.some(p => {
        const prod = dbProducts.find(dbP => dbP.sku && dbP.sku.toUpperCase() === p.sku.toUpperCase());
        return prod && prod.category === 'Service';
      });

      const container = document.getElementById(`door-inst-container-${doorIndex}`);
      if (!container) return;

      const roleLabel = (text) => `<span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.04em;min-width:36px;flex-shrink:0;">${text}</span>`;

      const serviceHtml = hasServiceProduct ? `
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            ${roleLabel('Service')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-service" data-role="service">
              ${buildDoorInstallerOptions(serviceInst?.id || '')}
            </select>
            <div style="width: 28px;"></div>
          </div>
      ` : '';

      container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.4rem;">
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            ${roleLabel('Lead')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-1" data-role="lead">
              ${buildDoorInstallerOptions(inst1Id)}
            </select>
            <button type="button" class="btn-minimal btn-success" onclick="saveDoorInstallersEdit(${doorIndex})" title="Save">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </button>
            <button type="button" class="btn-minimal btn-danger" onclick="cancelDoorInstallersEdit(${doorIndex})" title="Cancel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div id="edit-inst-2-wrapper-${doorIndex}" style="display: ${hasAssist2 ? 'flex' : 'none'}; gap: 0.35rem; align-items: center;">
            ${roleLabel('Assist')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-2" data-role="assist">
              ${buildDoorInstallerOptions(inst2Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="removeAssistInstallerEdit(${doorIndex}, 2)" title="Remove"><svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          <div id="edit-inst-3-wrapper-${doorIndex}" style="display: ${hasAssist3 ? 'flex' : 'none'}; gap: 0.35rem; align-items: center;">
            ${roleLabel('Assist')}
            <select class="form-input" style="height:auto; padding:0.35rem; font-size:0.8rem; flex:1;" id="edit-inst-${doorIndex}-3" data-role="assist">
              ${buildDoorInstallerOptions(inst3Id)}
            </select>
            <button type="button" class="btn-minimal btn-danger" onclick="removeAssistInstallerEdit(${doorIndex}, 3)" title="Remove"><svg viewBox="0 0 24 24" style="width:14px;height:14px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>
          ${serviceHtml}
          <button type="button" class="btn btn-outline btn-sm" id="btn-add-inst-edit-${doorIndex}"
            style="display: ${(hasAssist2 && hasAssist3) ? 'none' : 'inline-flex'}; font-size: 0.72rem; padding: 0.2rem 0.5rem;"
            onclick="addAssistInstallerEdit(${doorIndex})">+ Add Assist</button>
        </div>
      `;
    };

    window.addAssistInstallerEdit = function(doorIndex) {
      // Show the first hidden assist wrapper
      const w2 = document.getElementById(`edit-inst-2-wrapper-${doorIndex}`);
      const w3 = document.getElementById(`edit-inst-3-wrapper-${doorIndex}`);
      if (w2 && w2.style.display === 'none') {
        w2.style.display = 'flex';
      } else if (w3 && w3.style.display === 'none') {
        w3.style.display = 'flex';
      }
      // Hide add btn if both assist slots are now visible
      if (w2 && w3 && w2.style.display !== 'none' && w3.style.display !== 'none') {
        const addBtn = document.getElementById(`btn-add-inst-edit-${doorIndex}`);
        if (addBtn) addBtn.style.display = 'none';
      }
    };

    // Keep old name as alias for backwards compatibility
    window.addSecondInstallerEdit = window.addAssistInstallerEdit;

    window.removeAssistInstallerEdit = function(doorIndex, slotNum) {
      const wrapper = document.getElementById(`edit-inst-${slotNum}-wrapper-${doorIndex}`);
      if (wrapper) wrapper.style.display = 'none';
      const sel = document.getElementById(`edit-inst-${doorIndex}-${slotNum}`);
      if (sel) sel.value = '';
      // Show add btn again since a slot was freed
      const addBtn = document.getElementById(`btn-add-inst-edit-${doorIndex}`);
      if (addBtn) addBtn.style.display = 'inline-flex';
    };

    window.removeSecondInstallerEdit = function(doorIndex) {
      window.removeAssistInstallerEdit(doorIndex, 2);
    };

    window.cancelDoorInstallersEdit = function(doorIndex) {
      showBookingDetails(selectedBooking.id);
    };

    window.saveDoorInstallersEdit = async function(doorIndex) {
      if (!selectedBooking) return;

      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }

      const door = doorsArr[doorIndex];
      if (!door) return;

      const doorInstallers = [];
      [1, 2, 3].forEach(slot => {
        const sel = document.getElementById(`edit-inst-${doorIndex}-${slot}`);
        const wrapper = slot > 1 ? document.getElementById(`edit-inst-${slot}-wrapper-${doorIndex}`) : null;
        const isVisible = slot === 1 || (wrapper && wrapper.style.display !== 'none');
        if (!isVisible || !sel || !sel.value) return;
        const emp = dbEmployees.find(e => e.id === sel.value);
        if (emp) {
          const lastName = emp.last_name ? ` ${emp.last_name.trim()}` : '';
          const role = sel.dataset.role || (slot === 1 ? 'lead' : 'assist');
          doorInstallers.push({ id: emp.id, name: `${emp.first_name}${lastName}`, role });
        }
      });

      const serviceSel = document.getElementById(`edit-inst-${doorIndex}-service`);
      if (serviceSel && serviceSel.value) {
        const emp = dbEmployees.find(e => e.id === serviceSel.value);
        if (emp) {
          const lastName = emp.last_name ? ` ${emp.last_name.trim()}` : '';
          doorInstallers.push({ id: emp.id, name: `${emp.first_name}${lastName}`, role: 'service' });
        }
      }

      door.installers = doorInstallers;

      const allInstallersMap = new Map();
      doorsArr.forEach(d => {
        const dInstallers = d.installers || [];
        dInstallers.forEach(inst => {
          if (inst.id && !allInstallersMap.has(inst.id)) {
            allInstallersMap.set(inst.id, { id: inst.id, name: inst.name, role: inst.role });
          }
        });
      });

      const installersList = Array.from(allInstallersMap.values());
      const installerIdStr   = installersList.length > 0 ? installersList.map(i => i.id).join(' | ')   : null;
      const installerNameStr = installersList.length > 0 ? installersList.map(i => i.name).join(' | ') : null;

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({
            doors: doorsArr,
            installer_id: installerIdStr,
            installer_name: installerNameStr,
            installers: installersList
          })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        const bookingIndex = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (bookingIndex !== -1) {
          dbBookings[bookingIndex].doors = doorsArr;
          dbBookings[bookingIndex].installer_id = installerIdStr;
          dbBookings[bookingIndex].installer_name = installerNameStr;
          dbBookings[bookingIndex].installers = installersList;

          selectedBooking.doors = doorsArr;
          selectedBooking.installer_id = installerIdStr;
          selectedBooking.installer_name = installerNameStr;
          selectedBooking.installers = installersList;
        }

        showToast('Installers updated successfully.');
        showBookingDetails(selectedBooking.id);
        applyFilterAndRender();
      } catch (err) {
        console.error('Failed to update door installers:', err);
        showToast('Failed to update: ' + err.message, true);
      }
    };

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

    // --- Edit Doors Drag-and-Drop Editor State & Functions ---
    let tempEditDoors = [];
    let tempEditProducts = [];

    window.openEditDoorsModal = function() {
      if (!selectedBooking) return;

      // Parse doors array
      let doorsArr = [];
      if (typeof selectedBooking.doors === 'string') {
        try { doorsArr = JSON.parse(selectedBooking.doors); } catch(_) {}
      } else if (Array.isArray(selectedBooking.doors)) {
        doorsArr = selectedBooking.doors;
      }

      // Deep copy to prevent mutating original until saved
      tempEditDoors = JSON.parse(JSON.stringify(doorsArr));

      // Parse booking level products & skus to determine door count
      let productsArr = [];
      if (typeof selectedBooking.products === 'string') {
        try { productsArr = JSON.parse(selectedBooking.products); } catch(_) {}
      } else if (Array.isArray(selectedBooking.products)) {
        productsArr = selectedBooking.products;
      }
      tempEditProducts = JSON.parse(JSON.stringify(productsArr));
      let skus = [];
      if (selectedBooking.sku) {
        skus = selectedBooking.sku.split(' | ');
      }

      // Ensure tempEditDoors has at least rowCount doors to match the details view
      const rowCount = Math.max(productsArr.length, doorsArr.length, skus.length);
      while (tempEditDoors.length < rowCount) {
        const nextIdx = tempEditDoors.length + 1;
        tempEditDoors.push({
          index: nextIdx,
          swing: 'N/A',
          doorMaterial: 'N/A',
          jambMaterial: 'N/A',
          photos: [],
          checklist: [],
          completed: false,
          signature: null,
          installers: [],
          products: []
        });
      }

      // Make sure every door has a products array initialized
      tempEditDoors.forEach((d, idx) => {
        if (!d.products) d.products = [];
      });

      const anyDoorHasProducts = tempEditDoors.some(d => d.products && d.products.length > 0);
      if (!anyDoorHasProducts) {
        const isSingleDoor = (tempEditDoors.length === 1 && (productsArr.length > 0 || skus.length > 0));

        if (isSingleDoor) {
          const list = productsArr.length > 0 ? productsArr.map(p => p.sku) : skus;
          tempEditDoors[0].products = list.filter(sku => sku !== 'ADD-ON LABOR');
        } else {
          // Map one-to-one
          tempEditDoors.forEach((d, idx) => {
            if (productsArr[idx]) {
              d.products = [productsArr[idx].sku];
            } else if (skus[idx]) {
              d.products = [skus[idx]];
            } else {
              d.products = [];
            }
          });
        }
      }

      renderEditDoors();
      document.getElementById('edit-doors-modal').classList.add('open');
    };

    window.closeEditDoorsModal = function(e) {
      document.getElementById('edit-doors-modal').classList.remove('open');
    };

    window.closeDragWarningModal = function() {
      document.getElementById('drag-warning-modal').classList.remove('open');
    };

    function showDragWarning(title, msg) {
      document.getElementById('drag-warning-title').textContent = title;
      document.getElementById('drag-warning-message').textContent = msg;
      document.getElementById('drag-warning-modal').classList.add('open');
    }

    function renderEditDoors() {
      const container = document.getElementById('edit-doors-container');
      if (!container) return;
      container.innerHTML = '';

      // Load products catalog list to get titles
      let productsCatalog = [];
      if (typeof selectedBooking.products === 'string') {
        try { productsCatalog = JSON.parse(selectedBooking.products); } catch(_) {}
      } else if (Array.isArray(selectedBooking.products)) {
        productsCatalog = selectedBooking.products;
      }

      tempEditDoors.forEach((door, doorIdx) => {
        const doorProducts = door.products || [];
        const hasInst = hasValidInstallers(door);
        
        let productsHtml = '';
        if (doorProducts.length === 0) {
          productsHtml = `
            <div style="color: var(--text-muted); font-size: 0.75rem; text-align: center; padding: 1rem; border: 1px dashed var(--border); border-radius: 6px;">
              No products inside this door. Drag here to add.
            </div>
          `;
        } else {
          doorProducts.forEach((sku, prodIdx) => {
            const catalogItem = productsCatalog.find(p => p.sku === sku);
            const title = catalogItem ? (catalogItem.name || catalogItem.title) : sku;
            const isCancelled = isSkuCancelled(sku, doorIdx, prodIdx);
            productsHtml += `
              <div class="drag-product-item" draggable="${hasInst ? 'false' : 'true'}" 
                ondragstart="handleDragStart(event, ${doorIdx}, ${prodIdx})"
                ondragend="handleDragEnd(event)">
                <div class="drag-handle">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"></circle><circle cx="9" cy="12" r="2"></circle><circle cx="9" cy="19" r="2"></circle><circle cx="15" cy="5" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="15" cy="19" r="2"></circle></svg>
                </div>
                <div class="drag-product-text">
                  <strong>${escapeHtml(sku)}</strong> - <span style="font-weight:normal; color:var(--text-secondary);">${escapeHtml(title)}</span>
                  ${isCancelled ? `
                    <span style="color:var(--danger); font-size:0.7rem; font-weight:700; text-transform:uppercase; margin-left:0.35rem;">
                      Cancelled
                    </span>
                  ` : ''}
                </div>
                <button type="button" class="btn-minimal ${isCancelled ? 'btn-success' : 'btn-danger'}" 
                  onclick="event.stopPropagation(); toggleSkuCancelled('${sku}', ${doorIdx}, ${prodIdx})" 
                  title="${isCancelled ? 'Undo Cancel Product' : 'Cancel Product'}" 
                  style="display:inline-flex; padding: 4px; margin-left: 0.5rem; z-index: 10;">
                  ${isCancelled ? `
                    <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                  ` : `
                    <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  `}
                </button>
              </div>
            `;
          });
        }

        const isUnassignedDoor = doorProducts.length === 0;

        const doorHtml = `
          <div class="edit-door-box ${hasInst ? 'door-has-installers' : ''}" id="edit-door-box-${doorIdx}"
            ${hasInst ? `onclick="handleDisabledDoorClick(event, ${doorIdx})"` : ''}
            ondragover="handleDragOver(event, ${doorIdx})"
            ondragleave="handleDragLeave(event, ${doorIdx})"
            ondrop="handleDrop(event, ${doorIdx})">
            <div class="edit-door-header">
              <span class="edit-door-title">Door ${door.index || (doorIdx + 1)}</span>
              ${isUnassignedDoor && !hasInst ? `
                <button type="button" class="btn-minimal btn-danger" onclick="deleteDoorEdit(${doorIdx})" title="Delete Door" style="display:inline-flex;padding:2px;">
                  <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              ` : ''}
            </div>
            <div class="edit-door-products-list">
              ${productsHtml}
            </div>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', doorHtml);
      });
    }

    window.addNewDoorEdit = function() {
      const nextIndex = tempEditDoors.length > 0 ? Math.max(...tempEditDoors.map(d => d.index || 0)) + 1 : 1;
      const newDoor = {
        index: nextIndex,
        swing: 'N/A',
        doorMaterial: 'N/A',
        jambMaterial: 'N/A',
        photos: [],
        checklist: [],
        completed: false,
        signature: null,
        installers: [],
        products: []
      };
      tempEditDoors.push(newDoor);
      renderEditDoors();
    };

    window.deleteDoorEdit = function(doorIdx) {
      const door = tempEditDoors[doorIdx];
      if (door && door.products && door.products.length > 0) {
        showDragWarning('Cannot Delete Door', 'You can only delete doors that have no products assigned to them.');
        return;
      }
      tempEditDoors.splice(doorIdx, 1);
      renderEditDoors();
    };

    // --- HTML5 Drag and Drop Handlers ---
    let dragSourceDoorIdx = null;
    let dragSourceProdIdx = null;

    function hasValidInstallers(door) {
      if (!door || !door.installers) return false;
      const list = Array.isArray(door.installers) ? door.installers : [];
      return list.some(inst => inst && (inst.id || inst.name));
    }

    window.handleDragStart = function(event, doorIdx, prodIdx) {
      const sourceDoor = tempEditDoors[doorIdx];
      if (sourceDoor && hasValidInstallers(sourceDoor)) {
        event.preventDefault();
        showDragWarning('Installers Assigned', 'Cannot move products from a door with assigned installers. Please remove the assigned installers first.');
        return;
      }

      dragSourceDoorIdx = doorIdx;
      dragSourceProdIdx = prodIdx;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', '');

      event.target.classList.add('dragging');
    };

    window.handleDragEnd = function(event) {
      event.target.classList.remove('dragging');
    };

    window.handleDragOver = function(event, doorIdx) {
      event.preventDefault();
      const box = document.getElementById(`edit-door-box-${doorIdx}`);
      if (box && doorIdx !== dragSourceDoorIdx) {
        box.classList.add('drag-over');
      }
    };

    window.handleDragLeave = function(event, doorIdx) {
      const box = document.getElementById(`edit-door-box-${doorIdx}`);
      if (box) {
        box.classList.remove('drag-over');
      }
    };

    window.handleDisabledDoorClick = function(event, doorIdx) {
      event.stopPropagation();
      const door = tempEditDoors[doorIdx];
      const doorNum = door.index || (doorIdx + 1);
      showDragWarning('Installers Assigned', `Door ${doorNum} has installers assigned. Please remove the assigned installers first in the dashboard before moving products.`);
    };

    window.handleDrop = function(event, targetDoorIdx) {
      event.preventDefault();
      const box = document.getElementById(`edit-door-box-${targetDoorIdx}`);
      if (box) {
        box.classList.remove('drag-over');
      }

      if (dragSourceDoorIdx === null || dragSourceProdIdx === null) return;
      if (dragSourceDoorIdx === targetDoorIdx) return;

      const targetDoor = tempEditDoors[targetDoorIdx];
      const sourceDoor = tempEditDoors[dragSourceDoorIdx];
      const productSku = sourceDoor.products[dragSourceProdIdx];

      // Move product immediately and adopt target door configurations
      sourceDoor.products.splice(dragSourceProdIdx, 1);
      if (!targetDoor.products) targetDoor.products = [];
      targetDoor.products.push(productSku);

      renderEditDoors();
      showToast('Product moved successfully.');

      dragSourceDoorIdx = null;
      dragSourceProdIdx = null;
    };

    function isSkuCancelled(sku, doorIdx, prodIdx) {
      const matchingProds = tempEditProducts.filter(p => p.sku === sku);
      let occurrenceIndex = 0;
      for (let d = 0; d < tempEditDoors.length; d++) {
        const door = tempEditDoors[d];
        const dProds = door.products || [];
        for (let p = 0; p < dProds.length; p++) {
          if (d === doorIdx && p === prodIdx) {
            const matchedProd = matchingProds[occurrenceIndex];
            return matchedProd ? !!matchedProd.cancelled : false;
          }
          if (dProds[p] === sku) {
            occurrenceIndex++;
          }
        }
      }
      return false;
    }

    window.toggleSkuCancelled = function(sku, doorIdx, prodIdx) {
      const matchingProds = tempEditProducts.filter(p => p.sku === sku);
      let occurrenceIndex = 0;
      for (let d = 0; d < tempEditDoors.length; d++) {
        const door = tempEditDoors[d];
        const dProds = door.products || [];
        for (let p = 0; p < dProds.length; p++) {
          if (d === doorIdx && p === prodIdx) {
            const matchedProd = matchingProds[occurrenceIndex];
            if (matchedProd) {
              matchedProd.cancelled = !matchedProd.cancelled;
              // If the product has been cancelled, clear the installers on this door automatically
              if (matchedProd.cancelled) {
                door.installers = [];
              }
            }
            renderEditDoors();
            return;
          }
          if (dProds[p] === sku) {
            occurrenceIndex++;
          }
        }
      }
    };

    window.saveEditDoorsLayout = async function() {
      if (!selectedBooking) return;

      let originalSkus = [];
      let productsArr = [];
      if (typeof selectedBooking.products === 'string') {
        try { productsArr = JSON.parse(selectedBooking.products); } catch(_) {}
      } else if (Array.isArray(selectedBooking.products)) {
        productsArr = selectedBooking.products;
      }
      if (productsArr.length > 0) {
        originalSkus = productsArr.map(p => p.sku).filter(sku => sku !== 'ADD-ON LABOR');
      } else if (selectedBooking.sku) {
        originalSkus = selectedBooking.sku.split(' | ').filter(sku => sku !== 'ADD-ON LABOR');
      }

      const allocatedSkus = [];
      tempEditDoors.forEach(d => {
        if (d.products) {
          d.products.forEach(sku => allocatedSkus.push(sku));
        }
      });

      const missingSkus = originalSkus.filter(sku => !allocatedSkus.includes(sku));
      if (missingSkus.length > 0) {
        showDragWarning('Incomplete Allocation', `Please allocate all purchased products to doors. Unallocated products: ${missingSkus.join(', ')}`);
        return;
      }

      const allInstallersMap = new Map();
      tempEditDoors.forEach(d => {
        const dInstallers = d.installers || [];
        dInstallers.forEach(inst => {
          if (inst.id && !allInstallersMap.has(inst.id)) {
            allInstallersMap.set(inst.id, { id: inst.id, name: inst.name, role: inst.role });
          }
        });
      });
      const installersList = Array.from(allInstallersMap.values());
      const installerIdStr   = installersList.length > 0 ? installersList.map(i => i.id).join(' | ')   : null;
      const installerNameStr = installersList.length > 0 ? installersList.map(i => i.name).join(' | ') : null;

      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({
            doors: tempEditDoors,
            products: tempEditProducts,
            installer_id: installerIdStr,
            installer_name: installerNameStr,
            installers: installersList
          })
          .eq('id', selectedBooking.id);

        if (error) throw error;

        const idx = dbBookings.findIndex(b => b.id === selectedBooking.id);
        if (idx !== -1) {
          dbBookings[idx].doors = tempEditDoors;
          dbBookings[idx].products = tempEditProducts;
          dbBookings[idx].installer_id = installerIdStr;
          dbBookings[idx].installer_name = installerNameStr;
          dbBookings[idx].installers = installersList;

          selectedBooking.doors = tempEditDoors;
          selectedBooking.products = tempEditProducts;
          selectedBooking.installer_id = installerIdStr;
          selectedBooking.installer_name = installerNameStr;
          selectedBooking.installers = installersList;
        }

        showToast('Door layout updated successfully.');
        closeEditDoorsModal();
        showBookingDetails(selectedBooking.id);
        applyFilterAndRender();
      } catch (err) {
        console.error('Failed to save edit doors layout:', err);
        showToast('Failed to save layout: ' + err.message, true);
      }
    };