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
    let calendarBookings = [];
    let calendarDayEvents = [];
    let dbTransactionsMap = new Map();
    let dbEmployees = [];
    let dbProducts = [];
    let dbProductsBySku = new Map();
    let bookingMediaRequirements = [];
    let bookingChecklist = [];
    let bookingMediaRequirementSets = {};
    let bookingChecklistSets = {};
    let installerPayoutSettings = {};
    let filteredBookings = [];
    let filteredCalendarBookings = [];
    let filteredCalendarDayEvents = [];
    let selectedBooking = null;
    let selectedDayDate = '';
    let searchQuery = '';
    let allBookingsSortKey = '';
    let allBookingsSortDirection = 'asc';
    let slotFiles = {};
    let otherFiles = [];
    let uploadDoorIndex = null;

    // Date state
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();

    function isDoorCancelledForCompletion(door, doorIndex, doors, products) {
      if (door?.cancelled === true || String(door?.status || '').toLowerCase() === 'cancelled') return true;
      const hardwareProducts = products.filter(product => String(product?.sku || '').trim().toUpperCase() !== 'ADD-ON LABOR');
      const hasAttachedProducts = doors.some(item => Array.isArray(item?.products) && item.products.length > 0);
      if (hasAttachedProducts) {
        const attachedSkus = Array.isArray(door?.products) ? door.products : [];
        return attachedSkus.length > 0 && attachedSkus.every(sku => {
          let matches = products.filter(product => product?.sku === sku);
          const indexedMatches = matches.filter(product => Number(product?.doorIndex) === doorIndex);
          if (indexedMatches.length > 0) matches = indexedMatches;
          return matches.length > 0 && matches.every(product => product?.cancelled === true);
        });
      }
      if (doors.length === 1) {
        return hardwareProducts.length > 0 && hardwareProducts.every(product => product?.cancelled === true);
      }
      return hardwareProducts[doorIndex]?.cancelled === true;
    }

    function getCalendarBookingDoorState(booking) {
      let doors = [];
      let products = [];
      let bookingInstallers = [];
      if (Array.isArray(booking?.doors)) doors = booking.doors;
      else if (typeof booking?.doors === 'string') {
        try { doors = JSON.parse(booking.doors); } catch (_) {}
      }
      if (Array.isArray(booking?.products)) products = booking.products;
      else if (typeof booking?.products === 'string') {
        try { products = JSON.parse(booking.products); } catch (_) {}
      }
      if (Array.isArray(booking?.installers)) bookingInstallers = booking.installers;
      else if (typeof booking?.installers === 'string') {
        try { bookingInstallers = JSON.parse(booking.installers); } catch (_) {}
      }

      const activeDoors = doors.filter((door, doorIndex) => (
        !isDoorCancelledForCompletion(door, doorIndex, doors, products)
      ));
      const hasDoorAssignments = doors.some(door => (
        Array.isArray(door?.installers) && door.installers.some(installer => installer?.id || installer?.name)
      ));
      const installers = hasDoorAssignments
        ? activeDoors.flatMap(door => Array.isArray(door?.installers) ? door.installers : [])
        : bookingInstallers;
      const activeProducts = products.filter(product => !product?.cancelled);
      const serviceOnlySkus = new Set(['BACKJOB', 'OCULAR', 'ADD-ON LABOR']);
      const hasHardwareProduct = activeProducts.some(product => {
        const sku = String(product?.sku || '').trim().toUpperCase();
        if (serviceOnlySkus.has(sku)) return false;
        return String(dbProductsBySku.get(sku)?.category || '').trim().toLowerCase() !== 'service';
      });
      const hasServiceProduct = activeProducts.some(product => {
        const sku = String(product?.sku || '').trim().toUpperCase();
        return serviceOnlySkus.has(sku)
          || String(dbProductsBySku.get(sku)?.category || '').trim().toLowerCase() === 'service';
      });
      const isServiceOnly = !hasHardwareProduct
        && (hasServiceProduct || (
          installers.length > 0
          && installers.every(installer => String(installer?.role || '').trim().toLowerCase() === 'service')
        ));
      const installerNames = [];
      const seenInstallers = new Set();
      installers.forEach(installer => {
        const employee = installer?.id ? dbEmployees.find(item => item.id === installer.id) : null;
        const name = String(installer?.name || [employee?.first_name, employee?.last_name].filter(Boolean).join(' ')).trim();
        const key = String(installer?.id || name).toLowerCase();
        if (!name || seenInstallers.has(key)) return;
        seenInstallers.add(key);
        installerNames.push(name);
      });

      return {
        doors,
        products,
        hideFromCalendar: doors.length > 0 && activeDoors.length === 0,
        isServiceOnly,
        installerName: hasDoorAssignments
          ? installerNames.join(', ')
          : (installerNames.join(', ') || String(booking?.installer_name || '').trim())
      };
    }

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
      updateTabLinks();
    }

    function getCurrentSubpage() {
      const path = window.location.pathname.replace(/\/$/, '');
      if (path.endsWith('/all-bookings')) return 'all-bookings';
      if (path.endsWith('/installers/accounts')) return 'installer-accounts';
      if (path.endsWith('/installers/notes')) return 'installer-notes';
      if (path.endsWith('/installers/tools')) return 'installer-tools';
      if (path.endsWith('/installers/assignments') || path.endsWith('/installers')) return 'installer-assignments';
      return 'calendar';
    }

    function updateTabLinks() {
      const monthHash = `#${String(currentMonth + 1).padStart(2, '0')}-${currentYear}`;
      const calendarTab = document.getElementById('tab-calendar');
      const allBookingsTab = document.getElementById('tab-all-bookings');
      const installerAssignmentsTab = document.getElementById('tab-installer-assignments');
      if (calendarTab) calendarTab.href = `/dashboard/booking-schedules/calendar${monthHash}`;
      if (allBookingsTab) allBookingsTab.href = `/dashboard/booking-schedules/all-bookings${monthHash}`;
      if (installerAssignmentsTab) installerAssignmentsTab.href = `/dashboard/installers/assignments${monthHash}`;
    }

    function renderCurrentSubpage() {
      const currentSubpage = getCurrentSubpage();
      const tabCalendar = document.getElementById('tab-calendar');
      const tabAllBookings = document.getElementById('tab-all-bookings');
      const panelCalendar = document.getElementById('tab-panel-schedules');
      const panelAllBookings = document.getElementById('tab-panel-all-bookings');
      const panelInstallers = document.getElementById('tab-panel-installers');
      const panelInstallerAccounts = document.getElementById('tab-panel-installer-accounts');
      const panelInstallerNotes = document.getElementById('tab-panel-installer-notes');
      const panelInstallerTools = document.getElementById('tab-panel-installer-tools');
      const scheduleTabs = document.getElementById('booking-schedule-tabs');
      const installerTabs = document.getElementById('installer-tabs');
      const tabInstallerAssignments = document.getElementById('tab-installer-assignments');
      const tabInstallerAccounts = document.getElementById('tab-installer-accounts');
      const tabInstallerNotes = document.getElementById('tab-installer-notes');
      const tabInstallerTools = document.getElementById('tab-installer-tools');
      const monthNavigator = document.getElementById('calendar-month-navigator');
      const allBookingsSearch = document.getElementById('all-bookings-search');
      const scrollContainer = document.querySelector('.scroll-container');
      const pageTitle = document.getElementById('booking-page-title');
      const createNoteButton = document.getElementById('create-installer-note');
      const issueToolButton = document.getElementById('issue-tool-button');
      const isInstallerAssignments = currentSubpage === 'installer-assignments';
      const isInstallerAccounts = currentSubpage === 'installer-accounts';
      const isInstallerNotes = currentSubpage === 'installer-notes';
      const isInstallerTools = currentSubpage === 'installer-tools';
      const isInstallersPage = isInstallerAssignments || isInstallerAccounts || isInstallerNotes || isInstallerTools;
      const showsBookingControls = currentSubpage === 'calendar' || currentSubpage === 'all-bookings';

      if (tabCalendar) tabCalendar.classList.toggle('active', currentSubpage === 'calendar');
      if (tabAllBookings) tabAllBookings.classList.toggle('active', currentSubpage === 'all-bookings');
      if (panelCalendar) panelCalendar.style.display = currentSubpage === 'calendar' ? 'block' : 'none';
      if (panelAllBookings) panelAllBookings.style.display = currentSubpage === 'all-bookings' ? 'flex' : 'none';
      if (panelInstallers) panelInstallers.style.display = isInstallerAssignments ? 'block' : 'none';
      if (panelInstallerAccounts) panelInstallerAccounts.style.display = isInstallerAccounts ? 'block' : 'none';
      if (panelInstallerNotes) panelInstallerNotes.style.display = isInstallerNotes ? 'flex' : 'none';
      if (panelInstallerTools) panelInstallerTools.style.display = isInstallerTools ? 'block' : 'none';
      if (scheduleTabs) scheduleTabs.style.display = isInstallersPage ? 'none' : 'flex';
      if (scheduleTabs) scheduleTabs.classList.toggle('booking-controls-active', showsBookingControls);
      if (installerTabs) installerTabs.style.display = isInstallersPage ? 'flex' : 'none';
      if (installerTabs) installerTabs.classList.toggle('installer-notes-active', isInstallerNotes);
      if (tabInstallerAssignments) tabInstallerAssignments.classList.toggle('active', isInstallerAssignments);
      if (tabInstallerAccounts) tabInstallerAccounts.classList.toggle('active', isInstallerAccounts);
      if (tabInstallerNotes) tabInstallerNotes.classList.toggle('active', isInstallerNotes);
      if (tabInstallerTools) tabInstallerTools.classList.toggle('active', isInstallerTools);
      if (monthNavigator) monthNavigator.style.display = (isInstallerAccounts || isInstallerNotes || isInstallerTools) ? 'none' : 'flex';
      if (allBookingsSearch) allBookingsSearch.style.display = showsBookingControls ? 'flex' : 'none';
      if (scrollContainer) scrollContainer.classList.toggle('installer-notes-active', isInstallerNotes);
      if (scrollContainer) scrollContainer.classList.toggle('booking-controls-active', showsBookingControls);
      if (pageTitle) pageTitle.textContent = isInstallersPage ? 'Installers' : 'Installation Schedules';
      if (createNoteButton) createNoteButton.style.display = isInstallerNotes ? 'inline-flex' : 'none';
      if (issueToolButton) issueToolButton.style.display = isInstallerTools ? 'inline-flex' : 'none';
      document.body.classList.toggle('booking-all-bookings-page', currentSubpage === 'all-bookings');
      document.body.classList.toggle('installer-notes-page', isInstallerNotes);
      document.title = isInstallersPage
        ? 'Installers — Brightkey Admin'
        : 'Installation Schedules — Brightkey Admin';

    }

    function getMonthDateRange(year, month) {
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      return { start, end };
    }

    function formatLocalDate(date) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function getCalendarDateRange(year, month) {
      const startDate = new Date(year, month, 1);
      startDate.setDate(startDate.getDate() - startDate.getDay());
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 41);
      return { start: formatLocalDate(startDate), end: formatLocalDate(endDate) };
    }

    const MONTH_NAMES = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    document.addEventListener("DOMContentLoaded", async () => {
      const currentSubpage = getCurrentSubpage();
      renderCurrentSubpage();
      if (window.BKAuth) {
        const authInfo = await window.BKAuth.checkRoleGate(['Operations'], '/admin.html');
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

      if (currentSubpage === 'installer-accounts') {
        await window.BKInstallerAccounts?.init({ sb, companyId: currentCompanyId });
        return;
      }

      if (currentSubpage === 'installer-notes') {
        await window.BKInstallerNotes?.init({ sb, companyId: currentCompanyId });
        return;
      }

      if (currentSubpage === 'installer-tools') {
        await window.BKInstallerTools?.init({ sb, companyId: currentCompanyId });
        return;
      }

      setMonthBookingsLoading(true);
      updateTabLinks();
      const monthTitle = document.getElementById('calendar-month-title');
      if (monthTitle) monthTitle.textContent = `${MONTH_NAMES[currentMonth]} ${currentYear}`;

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

      await Promise.all([
        loadStaticData(),
        loadMonthBookings()
      ]);
      // The month can finish before the static installer/configuration batch.
      // Render once more after both are ready so every subpage has complete data.
      applyFilterAndRender();
    });

    // Fetches employees, products, settings — once per page load
    async function loadStaticData() {
      try {
        const [employeesRes, assignmentsRes, productsRes, payoutRes, mediaRes, checklistRes] = await Promise.all([
          sb.rpc('get_company_installer_directory', {
            p_company_id: currentCompanyId
          }),
          sb.from('employee_assignments').select('id, name, visibility').eq('company_id', currentCompanyId || ''),
          sb.from('products')
            .select('id, sku, company_id, category, title, image_main'),
          sb.from('global_settings').select('value').eq('key', 'installer_payout_settings').eq('company_id', currentCompanyId).maybeSingle(),
          sb.from('global_settings').select('value').eq('key', 'booking_media_requirements').eq('company_id', currentCompanyId).maybeSingle(),
          sb.from('global_settings').select('value').eq('key', 'booking_checklist').eq('company_id', currentCompanyId).maybeSingle()
        ]);

        dbProducts = productsRes?.data || [];
        dbProductsBySku = new Map(
          dbProducts
            .filter(product => product.sku)
            .map(product => [String(product.sku).toUpperCase(), product])
        );
        dbEmployees = employeesRes.data || [];

        window._installerAssignmentNames = (assignmentsRes.data || [])
          .filter(a => String(a.name || '').trim().toLowerCase() === 'installers' || (Array.isArray(a.visibility) && a.visibility.includes('booking.door_specifications')))
          .map(a => a.name);

        if (employeesRes.error) console.error('Error loading employees:', employeesRes.error);
        if (assignmentsRes.error) console.error('Error loading assignments:', assignmentsRes.error);
        if (productsRes.error) console.error('Error loading products:', productsRes.error);
        if (payoutRes.error) console.error('Error loading installer payout settings:', payoutRes.error);
        if (mediaRes.error) console.error('Error loading media requirements:', mediaRes.error);
        if (checklistRes.error) console.error('Error loading checklist:', checklistRes.error);

        installerPayoutSettings = payoutRes.data?.value || {};
        bookingMediaRequirementSets = parseInstallerWorkflowSets(mediaRes.data?.value);
        bookingChecklistSets = parseInstallerWorkflowSets(checklistRes.data?.value);
        bookingMediaRequirements = bookingMediaRequirementSets.lead || [];
        bookingChecklist = bookingChecklistSets.lead || [];
      } catch (err) {
        console.error('Failed to load static data:', err);
        showToast('Failed to load configuration: ' + err.message, true);
      }
    }

    function parseInstallerWorkflowSets(value) {
      if (Array.isArray(value)) return { lead: value };
      return value && typeof value === 'object' && value.sets && typeof value.sets === 'object' ? value.sets : {};
    }

    function useBookingWorkflowForDoor(booking, door) {
      let doors = [];
      if (Array.isArray(booking?.doors)) doors = booking.doors;
      else if (typeof booking?.doors === 'string') {
        try { doors = JSON.parse(booking.doors); } catch (_) {}
      }
      let bookingInstallers = [];
      if (Array.isArray(booking?.installers)) bookingInstallers = booking.installers;
      else if (typeof booking?.installers === 'string') {
        try { bookingInstallers = JSON.parse(booking.installers); } catch (_) {}
      }
      const allInstallers = [...bookingInstallers, ...doors.flatMap(item => Array.isArray(item?.installers) ? item.installers : [])];
      const hasLead = allInstallers.some((installer, index) => String(installer?.role || (index === 0 ? 'lead' : 'assist')).toLowerCase() === 'lead');
      let key = 'lead';
      if (!hasLead) {
        let products = [];
        if (Array.isArray(booking?.products)) products = booking.products;
        else if (typeof booking?.products === 'string') {
          try { products = JSON.parse(booking.products); } catch (_) {}
        }
        const attached = Array.isArray(door?.products) ? door.products : [];
        const candidates = [...attached, ...products.filter(product => !product?.cancelled).map(product => product?.sku)];
        const serviceSku = candidates.map(value => String(value || '').trim().toUpperCase()).find(sku => dbProductsBySku.get(sku)?.category === 'Service');
        key = `service:${serviceSku || 'UNSPECIFIED'}`;
      }
      bookingChecklist = Array.isArray(bookingChecklistSets[key]) ? bookingChecklistSets[key] : [];
      bookingMediaRequirements = Array.isArray(bookingMediaRequirementSets[key]) ? bookingMediaRequirementSets[key] : [];
      return key;
    }

    // Fetches the six-week calendar window so adjacent-month dates can be shown.
    function setMonthBookingsLoading(isLoading) {
      const overlay = document.getElementById('month-loading-overlay');
      const navigator = document.getElementById('calendar-month-navigator');
      if (overlay) {
        overlay.classList.toggle('active', isLoading);
        overlay.setAttribute('aria-hidden', String(!isLoading));
      }
      if (navigator) {
        navigator.querySelectorAll('button').forEach(button => {
          button.disabled = isLoading;
        });
      }
    }

    function getDayEventSettingKey(year, monthIndex) {
      return `booking_calendar_day_events_${year}_${String(monthIndex + 1).padStart(2, '0')}`;
    }

    let calendarEventTypes = ['Day-off'];

    function renderCalendarEventTypeOptions() {
      const select = document.getElementById('event-type');
      if (!select) return;
      const selected = select.value;
      select.replaceChildren(...calendarEventTypes.map(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        return option;
      }));
      if (calendarEventTypes.includes(selected)) select.value = selected;
    }

    function getCalendarDayEventSettingKeys(start, end) {
      const keys = [];
      const cursor = new Date(`${start}T00:00:00`);
      const last = new Date(`${end}T00:00:00`);
      cursor.setDate(1);
      last.setDate(1);
      while (cursor <= last) {
        keys.push(getDayEventSettingKey(cursor.getFullYear(), cursor.getMonth()));
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return keys;
    }

    async function loadMonthBookings() {
      setMonthBookingsLoading(true);
      updateHash();
      const { start, end } = getCalendarDateRange(currentYear, currentMonth);
      const monthRange = getMonthDateRange(currentYear, currentMonth);
      try {
        const dayEventKeys = getCalendarDayEventSettingKeys(start, end);
        const [bookingsRes, dayEventsRes, eventTypesRes] = await Promise.all([
          sb
            .from('installation_bookings')
            .select('*')
            .eq('company_id', currentCompanyId)
            .gte('scheduled_date', start)
            .lte('scheduled_date', end),
          sb
            .from('global_settings')
            .select('key,value')
            .eq('company_id', currentCompanyId)
            .in('key', dayEventKeys),
          sb
            .from('global_settings')
            .select('value')
            .eq('company_id', currentCompanyId)
            .eq('key', 'booking_calendar_event_types')
            .maybeSingle()
        ]);

        if (dayEventsRes.error) throw dayEventsRes.error;
        if (eventTypesRes.error) throw eventTypesRes.error;
        const savedEventTypes = Array.isArray(eventTypesRes.data?.value) ? eventTypesRes.data.value.map(value => String(value || '').trim()).filter(Boolean) : [];
        calendarEventTypes = ['Day-off', ...savedEventTypes.filter(value => value.toLowerCase() !== 'day-off')];
        renderCalendarEventTypeOptions();
        calendarDayEvents = (dayEventsRes.data || []).flatMap(setting => (
          Array.isArray(setting.value) ? setting.value : []
        )).filter(event => event?.date >= start && event?.date <= end);

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

        calendarBookings = data || [];
        dbBookings = calendarBookings.filter(booking => (
          booking.scheduled_date >= monthRange.start && booking.scheduled_date <= monthRange.end
        ));

        // Fetch inventory_transactions statuses in batch for the loaded bookings
        dbTransactionsMap.clear();
        const orderNos = calendarBookings.map(b => b.order_no).filter(Boolean);
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
      } finally {
        setMonthBookingsLoading(false);
      }
    }

    function handleSearch() {
      searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
      applyFilterAndRender();
    }

    function applyFilterAndRender() {
      if (!searchQuery) {
        filteredBookings = [...dbBookings];
        filteredCalendarBookings = [...calendarBookings];
        filteredCalendarDayEvents = [...calendarDayEvents];
      } else {
        const matchesSearch = b => {
          const orderNo = (b.order_no || '').toLowerCase();
          const name = (b.customer_name || '').toLowerCase();
          const address = (b.customer_address || '').toLowerCase();
          const skus = (b.product_skus || '').toLowerCase();
          return orderNo.includes(searchQuery)
            || name.includes(searchQuery)
            || address.includes(searchQuery)
            || skus.includes(searchQuery);
        };
        filteredBookings = dbBookings.filter(matchesSearch);
        filteredCalendarBookings = calendarBookings.filter(matchesSearch);
        filteredCalendarDayEvents = calendarDayEvents.filter(event => {
          const type = String(event.type || '').toLowerCase();
          return type.includes(searchQuery);
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
      filteredCalendarBookings.sort((a, b) => {
        const dateA = a.scheduled_date || '9999-12-31';
        const dateB = b.scheduled_date || '9999-12-31';
        if (dateA !== dateB) return dateA.localeCompare(dateB);
        return (isAfternoon(a.scheduled_time) ? 1 : 0) - (isAfternoon(b.scheduled_time) ? 1 : 0);
      });

      drawCalendar();
      drawAllBookingsList();
      if (typeof window.drawInstallersSummary === 'function') window.drawInstallersSummary();
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

    function getAllBookingsStatus(booking) {
      let doors = [];
      let products = [];
      const bookingStatus = String(booking.status || '').toLowerCase();

      if (['aborted', 'cancelled', 'canceled'].includes(bookingStatus)) return 'Aborted';

      if (Array.isArray(booking.doors)) doors = booking.doors;
      else if (typeof booking.doors === 'string') {
        try { doors = JSON.parse(booking.doors); } catch (_) {}
      }

      if (Array.isArray(booking.products)) products = booking.products;
      else if (typeof booking.products === 'string') {
        try { products = JSON.parse(booking.products); } catch (_) {}
      }

      const bookingMarkedDone = ['done', 'completed', 'finished'].includes(bookingStatus);
      const allDoorsMarkedDone = doors.length > 0 && doors.every((door, doorIndex) => (
        Boolean(door?.completed) || isDoorCancelledForCompletion(door, doorIndex, doors, products)
      ));

      return bookingMarkedDone || allDoorsMarkedDone ? 'Done' : 'Scheduled';
    }

    function drawAllBookingsList() {
      const tbody = document.getElementById('all-bookings-tbody');
      if (!tbody) return;

      const yearStr = String(currentYear);
      const monthStr = String(currentMonth + 1).padStart(2, '0');
      const prefix = `${yearStr}-${monthStr}`;

      const bookingsInMonth = filteredBookings.filter(b => b.scheduled_date && b.scheduled_date.startsWith(prefix));

      document.querySelectorAll('.booking-sort-btn').forEach(button => {
        const active = button.dataset.sort === allBookingsSortKey;
        if (active) button.dataset.direction = allBookingsSortDirection;
        else delete button.dataset.direction;
        button.setAttribute('aria-sort', active ? (allBookingsSortDirection === 'asc' ? 'ascending' : 'descending') : 'none');
      });

      if (allBookingsSortKey) {
        const sortValue = (booking) => {
          if (allBookingsSortKey === 'date') return booking.scheduled_date || '';
          if (allBookingsSortKey === 'name') return booking.customer_name || '';
          if (allBookingsSortKey === 'order') return booking.order_no || '';
          if (allBookingsSortKey === 'city') {
            const fallback = getCityFromAddress(booking.customer_address);
            return String(booking.customer_city || '').trim() || (fallback === 'N/A' ? '' : fallback);
          }
          if (allBookingsSortKey === 'sku') return booking.product_skus || '';
          if (allBookingsSortKey === 'qty') return String(booking.product_qtys || '').split('|').reduce((sum, qty) => sum + (Number(qty.trim()) || 0), 0);
          if (allBookingsSortKey === 'status') return getAllBookingsStatus(booking);
          return '';
        };
        bookingsInMonth.sort((a, b) => {
          const left = sortValue(a);
          const right = sortValue(b);
          const result = typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
          return allBookingsSortDirection === 'asc' ? result : -result;
        });
      }

      if (bookingsInMonth.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding: 2rem 0;">No bookings found for the selected month.</td></tr>`;
        return;
      }

      tbody.innerHTML = bookingsInMonth.map(b => {
        const installDate = b.scheduled_date ? formatDateFriendly(b.scheduled_date) : 'Unscheduled';
        const name = escapeHtml(b.customer_name || '—');
        const orderNo = escapeHtml(b.order_no || '—');
        
        // Prefer the dedicated city field; parse legacy comma-separated addresses only as a fallback.
        const fallbackCity = getCityFromAddress(b.customer_address);
        const city = escapeHtml(String(b.customer_city || '').trim() || (fallbackCity === 'N/A' ? '—' : fallbackCity));

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
        const status = getAllBookingsStatus(b);
        const statusClass = status.toLowerCase();

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
            <td style="text-align: center;"><span class="installer-history-status-pill ${statusClass}">${status}</span></td>
            <td style="text-align: center;">${deleteButton}</td>
          </tr>
        `;
      }).join('') + '<tr class="table-spacer-row"><td colspan="8"></td></tr>';
    }

    function sortAllBookings(key) {
      allBookingsSortDirection = allBookingsSortKey === key && allBookingsSortDirection === 'asc' ? 'desc' : 'asc';
      allBookingsSortKey = key;
      drawAllBookingsList();
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

      const gridStart = new Date(currentYear, currentMonth, 1);
      gridStart.setDate(gridStart.getDate() - gridStart.getDay());

      // Always render a complete six-week grid, including adjacent-month dates.
      for (let offset = 0; offset < 42; offset++) {
        const cellDate = new Date(gridStart);
        cellDate.setDate(gridStart.getDate() + offset);
        const day = cellDate.getDate();
        const dateStr = formatLocalDate(cellDate);
        const isOutsideMonth = cellDate.getFullYear() !== currentYear || cellDate.getMonth() !== currentMonth;
        
        // Filter bookings scheduled for this date (from our searched list)
        const dayBookings = filteredCalendarBookings.filter(b => (
          b.scheduled_date === dateStr && !getCalendarBookingDoorState(b).hideFromCalendar
        ));
        const dayEvents = filteredCalendarDayEvents.filter(event => event.date === dateStr);

        let amHtml = '';
        let pmHtml = '';
        let amEventHtml = '';
        let pmEventHtml = '';

        dayBookings.forEach(b => {
          const cityStr = String(b.customer_city || '').trim() || getCityFromAddress(b.customer_address);
          const alertIcon = (b.needs_work_permit && !b.work_permit_image_url) 
            ? ` <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-left: 2px;"><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>` 
            : '';
          const displayText = `${escapeHtml(b.customer_name)} (${escapeHtml(cityStr)})${alertIcon}`;
          const isAborted = b.status === 'cancelled';
          
          const calendarDoorState = getCalendarBookingDoorState(b);
          const doorsArr = calendarDoorState.doors;
          const productsArr = calendarDoorState.products;
          const calendarInstallerName = calendarDoorState.installerName;
          const installerBadgeColor = calendarDoorState.isServiceOnly ? '#F59E0B' : 'var(--success)';

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

          const isDone = !hasUnallocatedActiveLocks && doorsArr.length > 0 && doorsArr.every((door, doorIndex) => (
            door.completed || isDoorCancelledForCompletion(door, doorIndex, doorsArr, productsArr)
          ));

          const todayStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(todayDay).padStart(2, '0')}`;
          const isDayOff = b.product_skus && b.product_skus.toLowerCase().includes('day off');
          const isDayOffPassed = isDayOff && (b.scheduled_date <= todayStr);

          const hasMedia = !hasUnallocatedActiveLocks && (isDayOffPassed || (doorsArr.length > 0 && doorsArr.every((door, doorIndex) => (
            (door.media_urls && door.media_urls.length > 0)
            || isDoorCancelledForCompletion(door, doorIndex, doorsArr, productsArr)
          ))));

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
          const isMarkedDone = ['done', 'completed', 'finished'].includes(String(b.status || '').toLowerCase()) || isDone;
          const checkSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          const completionMarker = hasMedia
            ? `<span class="calendar-progress-check media-uploaded" title="All media uploaded" aria-label="All media uploaded">${checkSvg}</span>`
            : (isMarkedDone ? `<span class="calendar-progress-check" title="Done" aria-label="Done">${checkSvg}</span>` : '');
          const installerBadgeHtml = calendarInstallerName
            ? `<span class="calendar-installer-status">${completionMarker}<span class="calendar-inst-badge" style="background:${installerBadgeColor};">${escapeHtml(formatInstallerName(calendarInstallerName))}</span></span>`
            : '';

          const badgeHtml = isAborted
            ? `<span style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Aborted</span>`
            : (isDeliveryOnly && isFullyDone
                ? `<span class="calendar-inst-badge" style="background:var(--success);">${deliveryBadgeText}</span>`
                : installerBadgeHtml);

          const slotColorClass = isDayOff ? 'day-off' : (isAfternoon(b.scheduled_time) ? 'pm' : 'am');
          const slotHtml = `
            <div class="calendar-slot ${slotColorClass}${isAborted ? ' aborted' : ''}${isFullyDone ? ' completed-media' : ''}${isOutsideMonth ? ' adjacent-month-booking' : ''}" title="${escapeHtml(b.customer_name)} (${escapeHtml(cityStr)})"${isOutsideMonth ? ' aria-disabled="true"' : ` onclick="event.stopPropagation(); showBookingDetails('${b.id}')"`}>
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

        dayEvents.forEach(dayEvent => {
          const installerNames = (dayEvent.installers || [])
            .map(installer => formatInstallerName(installer.name || ''))
            .filter(Boolean)
            .join(', ');
          const eventName = String(dayEvent.name || dayEvent.type || 'Day-off').replace(/_/g, ' ').trim();
          const label = installerNames ? `${eventName} - ${installerNames}` : eventName;
          const slotHtml = `
            <div class="calendar-slot day-off${isOutsideMonth ? ' adjacent-month-booking' : ''}" title="${escapeHtml(label)}"${isOutsideMonth ? ' aria-disabled="true"' : ''}>
              <div style="font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%;">${escapeHtml(label)}</div>
            </div>
          `;

          if (isAfternoon(dayEvent.timeSlot)) {
            pmEventHtml += slotHtml;
          } else {
            amEventHtml += slotHtml;
          }
        });

        const hasMissingWorkPermit = dayBookings.some(b => b.needs_work_permit && !b.work_permit_image_url && b.status !== 'cancelled');
        const workPermitPill = hasMissingWorkPermit 
          ? `<span style="background:#EF4444; color:#fff; font-size:0.6rem; font-weight:700; padding:1px 6px; border-radius:4px; line-height:1.2; text-transform:uppercase; letter-spacing:0.02em;">Workpermit missing</span>`
          : '';

        const isToday = cellDate.getFullYear() === todayYear && cellDate.getMonth() === todayMonth && day === todayDay;
        const cellClass = `calendar-cell${isOutsideMonth ? ' adjacent-month' : ''}${isToday ? ' today' : ''}`;

        const cellHtml = `
          <div class="${cellClass}"${isOutsideMonth ? ' aria-disabled="true"' : ` onclick="handleDayClick('${dateStr}', event)"`}>
            <div class="calendar-cell-header">
              <span class="calendar-cell-num">${day}</span>
              ${workPermitPill}
            </div>
            <div class="calendar-half am">
              ${amEventHtml}${amHtml}
            </div>
            <div class="calendar-half pm">
              ${pmEventHtml}${pmHtml}
            </div>
          </div>
        `;
        cellsContainer.insertAdjacentHTML('beforeend', cellHtml);
      }
    }
