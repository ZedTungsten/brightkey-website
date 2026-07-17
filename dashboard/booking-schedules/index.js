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
    let dbTransactionsMap = new Map();
    let dbEmployees = [];
    let dbProducts = [];
    let dbProductsBySku = new Map();
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

    // ── Hash-based month state (e.g. #07-2026) ────────────────────────────────
    (function initMonthFromHash() {
      const hash = window.location.hash.replace('#', '');
      const match = hash.match(/^(\d{2})-(\d{4})$/);
      if (match) {
        const m = parseInt(match[1], 10) - 1;
        const y = parseInt(match[2], 10);
        if (m >= 0 && m <= 11 && y >= 2000) {
          currentMonth = m;
          currentYear = y;
        }
      }
    })();

    function updateHash() {
      const mm = String(currentMonth + 1).padStart(2, '0');
      window.location.replace(`#${mm}-${currentYear}`);
    }

    function getMonthDateRange(year, month) {
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { start, end };
    }

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

      await loadStaticData();
      await loadMonthBookings();
    });

    // Fetches employees, products, settings — once per page load
    async function loadStaticData() {
      try {
        const [employeesRes, assignmentsRes, productsRes] = await Promise.all([
          sb.from('employees').select('id, employee_number, first_name, last_name, title, department, assignment'),
          sb.from('employee_assignments').select('id, name, visibility').eq('company_id', currentCompanyId || ''),
          sb.from('products').select('id, sku, category')
        ]);

        dbProducts = productsRes?.data || [];
        dbProductsBySku = new Map(
          dbProducts
            .filter(product => product.sku)
            .map(product => [String(product.sku).toUpperCase(), product])
        );
        dbEmployees = employeesRes.data || [];

        window._installerAssignmentNames = (assignmentsRes.data || [])
          .filter(a => Array.isArray(a.visibility) && a.visibility.includes('booking.door_specifications'))
          .map(a => a.name);

        // Booking media requirements
        try {
          const { data: mediaReqsRes } = await sb
            .from('global_settings')
            .select('value')
            .eq('key', 'booking_media_requirements')
            .eq('company_id', currentCompanyId)
            .maybeSingle();
          bookingMediaRequirements = (mediaReqsRes?.value && Array.isArray(mediaReqsRes.value))
            ? mediaReqsRes.value : [];
        } catch (mediaErr) {
          console.error('Error loading media requirements:', mediaErr);
          bookingMediaRequirements = [];
        }

        // Booking checklist
        try {
          const { data: checklistSetting } = await sb
            .from('global_settings')
            .select('value')
            .eq('key', 'booking_checklist')
            .eq('company_id', currentCompanyId)
            .maybeSingle();
          bookingChecklist = (checklistSetting?.value && Array.isArray(checklistSetting.value))
            ? checklistSetting.value : [];
        } catch (checklistErr) {
          console.error('Error loading checklist:', checklistErr);
          bookingChecklist = [];
        }
      } catch (err) {
        console.error('Failed to load static data:', err);
        showToast('Failed to load configuration: ' + err.message, true);
      }
    }

    // Fetches only the current month's bookings — re-called on month navigation
    async function loadMonthBookings() {
      renderSkeletons();
      updateHash();
      const { start, end } = getMonthDateRange(currentYear, currentMonth);
      try {
        const bookingsRes = await sb
          .from('installation_bookings')
          .select('*')
          .eq('company_id', currentCompanyId)
          .gte('scheduled_date', start)
          .lte('scheduled_date', end);

        let data = bookingsRes.data;
        if (bookingsRes.error) {
          if (bookingsRes.error.message && bookingsRes.error.message.includes('column') && bookingsRes.error.message.includes('company_id')) {
            console.warn('Fallback: company_id column missing. Querying without filter.');
            const fallbackResult = await sb
              .from('installation_bookings')
              .select('*')
              .gte('scheduled_date', start)
              .lte('scheduled_date', end);
            if (fallbackResult.error) throw fallbackResult.error;
            data = fallbackResult.data;
          } else {
            throw bookingsRes.error;
          }
        }

        dbBookings = data || [];

        // Fetch inventory_transactions statuses in batch for the loaded bookings
        dbTransactionsMap.clear();
        const orderNos = dbBookings.map(b => b.order_no).filter(Boolean);
        if (orderNos.length > 0) {
          try {
            const { data: txsData, error: txsErr } = await sb
              .from('inventory_transactions')
              .select('reference_id, status')
              .in('reference_id', orderNos);
            if (!txsErr && txsData) {
              txsData.forEach(tx => {
                if (tx.reference_id) {
                  if (!dbTransactionsMap.has(tx.reference_id)) {
                    dbTransactionsMap.set(tx.reference_id, []);
                  }
                  dbTransactionsMap.get(tx.reference_id).push(tx.status);
                }
              });
            }
          } catch (e) {
            console.warn('Failed to batch load inventory transactions:', e);
          }
        }

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
      loadMonthBookings();
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
        showToast('The confirmation dialog is unavailable. Please refresh the page and try again.', true);
        return;
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
        await loadMonthBookings();
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
          let productsArr = [];
          if (b.products) {
            if (typeof b.products === 'string') {
              try { productsArr = JSON.parse(b.products); } catch(_) {}
            } else if (Array.isArray(b.products)) {
              productsArr = b.products;
            }
          }

          const allocatedSkus = new Set();
          const anyDoorHasProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);
          if (anyDoorHasProducts) {
            doorsArr.forEach(d => {
              if (d.products) {
                d.products.forEach(sku => allocatedSkus.add(sku));
              }
            });
          } else {
            const isSingleDoor = (doorsArr.length === 1 && productsArr.length > 0);
            if (isSingleDoor) {
              productsArr.forEach(p => {
                if (p.sku !== 'ADD-ON LABOR') allocatedSkus.add(p.sku);
              });
            } else {
              doorsArr.forEach((d, idx) => {
                if (productsArr[idx]) {
                  allocatedSkus.add(productsArr[idx].sku);
                }
              });
            }
          }

          const hasUnallocatedActiveLocks = productsArr.some(p => {
            if (p.cancelled) return false;
            const skuUpper = p.sku.toUpperCase();
            return !allocatedSkus.has(p.sku) &&
                   skuUpper !== 'ADD-ON LABOR' &&
                   skuUpper !== 'BACKJOB' &&
                   skuUpper !== 'OCULAR' &&
                   skuUpper !== 'DAY OFF' &&
                   !skuUpper.includes('BRACELET') &&
                   !skuUpper.includes('BASEPLATE') &&
                   !skuUpper.includes('LABOR') &&
                   !skuUpper.includes('KEY');
          });

          const isDone = !hasUnallocatedActiveLocks && doorsArr.length > 0 && doorsArr.every(d => {
            const attachedSkus = d.products || [];
            const allProductsCancelled = attachedSkus.length > 0 && attachedSkus.every(sku => {
              const matchedProd = productsArr.find(p => p.sku === sku);
              return matchedProd ? !!matchedProd.cancelled : false;
            });
            return d.completed || allProductsCancelled;
          });

          const todayStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;
          const isDayOff = b.product_skus && b.product_skus.toLowerCase().includes('day off');
          const isDayOffPassed = isDayOff && (b.scheduled_date <= todayStr);

          const hasMedia = !hasUnallocatedActiveLocks && (isDayOffPassed || (doorsArr.length > 0 && doorsArr.every(d => {
            const attachedSkus = d.products || [];
            const allProductsCancelled = attachedSkus.length > 0 && attachedSkus.every(sku => {
              const matchedProd = productsArr.find(p => p.sku === sku);
              return matchedProd ? !!matchedProd.cancelled : false;
            });
            return (d.media_urls && d.media_urls.length > 0) || allProductsCancelled;
          })));

          const noInstallers = !b.installer_id && (!b.installers || b.installers.length === 0);
          const noDoorsAssigned = doorsArr.length === 0 || doorsArr.every(d => {
            return (!d.products || d.products.length === 0 || d.products.every(pSku => pSku === 'N/A' || pSku === '')) &&
                   (!d.installers || d.installers.length === 0) &&
                   (d.swing === 'N/A' || !d.swing || d.swing === '');
          });
          const isDeliveryOnly = noInstallers && noDoorsAssigned;
          const txStatuses = dbTransactionsMap.get(b.order_no) || [];
          const isDispatched = txStatuses.includes('dispatched') || txStatuses.includes('received');
          const isReceived = txStatuses.includes('received');
          const deliveryBadgeText = isReceived ? 'Received' : 'Dispatched';

          const isFullyDone = ['done', 'completed', 'finished'].includes(b.status) 
            || (isDone && hasMedia)
            || (isDeliveryOnly && isDispatched)
            || isDayOffPassed;

          const badgeHtml = isAborted
            ? `<span style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Aborted</span>`
            : (isFullyDone 
                ? `<div style="display:flex; flex-direction:column; gap:2px; align-items:flex-start;">
                     ${isDayOff ? '' : `<span class="calendar-inst-badge" style="background:#22C55E; color:#fff; border:none; font-size:0.6rem; margin-top:2px;">${isDeliveryOnly ? deliveryBadgeText : 'Done, Media Uploaded'}</span>`}
                     ${b.installer_name ? `<span class="calendar-inst-badge" style="background:#E4E4E7; color:#71717A; font-size:0.58rem; margin-top:1px;">${escapeHtml(formatInstallerName(b.installer_name))}</span>` : ''}
                   </div>`
                : (b.installer_name ? `<span class="calendar-inst-badge">${escapeHtml(formatInstallerName(b.installer_name))}</span>` : ''));

          const slotColorClass = isDayOff ? 'day-off' : (isAfternoon(b.scheduled_time) ? 'pm' : 'am');
          const slotHtml = `
            <div class="calendar-slot ${slotColorClass}${isAborted ? ' aborted' : ''}${isFullyDone ? ' completed-media' : ''}" title="${escapeHtml(b.customer_name)} (${escapeHtml(cityStr)})" onclick="event.stopPropagation(); showBookingDetails('${b.id}')">
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

        const hasMissingWorkPermit = dayBookings.some(b => b.needs_work_permit && !b.work_permit_image_url && b.status !== 'cancelled');
        const workPermitPill = hasMissingWorkPermit 
          ? `<span style="background:#EF4444; color:#fff; font-size:0.6rem; font-weight:700; padding:1px 6px; border-radius:4px; line-height:1.2; text-transform:uppercase; letter-spacing:0.02em;">Workpermit missing</span>`
          : '';

        const isToday = (currentYear === todayYear && currentMonth === todayMonth && day === todayDay);
        const cellClass = isToday ? 'calendar-cell today' : 'calendar-cell';

        const cellHtml = `
          <div class="${cellClass}" onclick="handleDayClick('${dateStr}', event)">
            <div class="calendar-cell-header">
              <span class="calendar-cell-num">${day}</span>
              ${workPermitPill}
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


