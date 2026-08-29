'use strict';

// --- Offline Caching & Sync ---
function loadCachedBookings() {
  if (!currentInstaller) return;
  const cacheKey = `bk_cache_${currentInstaller.id}`;
  const cached = localStorage.getItem(cacheKey);
  loadCachedInstallerDayEvents(currentYear, currentMonth);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      dbBookings = data || [];
      updateSyncBanner(true, new Date(timestamp));
      drawCalendar();
      drawAgenda();
    } catch (_) {}
  }

  const cachedChecklist = localStorage.getItem(`bk_booking_checklist_${currentInstaller.company_id}`);
  if (cachedChecklist) {
    try {
      applyInstallerWorkflowSetting('checklist', JSON.parse(cachedChecklist));
      installerChecklistLoaded = true;
    } catch (_) {}
  }

  const cachedMediaReqs = localStorage.getItem(`bk_booking_media_requirements_${currentInstaller.company_id}`);
  if (cachedMediaReqs) {
    try {
      applyInstallerWorkflowSetting('media', JSON.parse(cachedMediaReqs));
    } catch (_) {}
  }

  const cachedDelivery = localStorage.getItem('bk_delivery_bookings_map');
  if (cachedDelivery) {
    try {
      deliveryBookingsMap = JSON.parse(cachedDelivery);
    } catch (_) {}
  }

  const cachedPayoutSettings = localStorage.getItem(`bk_installer_payout_settings_${currentInstaller.company_id}`);
  if (cachedPayoutSettings) {
    try {
      installerPayoutSettings = JSON.parse(cachedPayoutSettings);
    } catch (_) {}
  }

  const cachedServiceCatalog = localStorage.getItem(`bk_installer_service_catalog_${currentInstaller.company_id}`);
  if (cachedServiceCatalog) {
    try {
      installerServiceCatalog = JSON.parse(cachedServiceCatalog);
    } catch (_) {
      installerServiceCatalog = [];
    }
  }
}

function getInstallerDayEventSettingKey(year, monthIndex) {
  return `booking_calendar_day_events_${year}_${String(monthIndex + 1).padStart(2, '0')}`;
}

function getInstallerDayEventCacheKey(year, monthIndex) {
  return `bk_day_events_${currentInstaller.id}_${getInstallerDayEventSettingKey(year, monthIndex)}`;
}

function filterInstallerDayEvents(events) {
  return (Array.isArray(events) ? events : []).filter(event => (
    event?.date
    && Array.isArray(event.installers)
    && event.installers.some(installer => installer?.id === currentInstaller.id)
  ));
}

function getInstallerDayEventName(event) {
  if (event?.name) return String(event.name).trim();
  if (event?.type === 'day_off') return 'Day off';
  return String(event?.type || 'Event')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function loadCachedInstallerDayEvents(year, monthIndex) {
  if (!currentInstaller) return;
  const cached = localStorage.getItem(getInstallerDayEventCacheKey(year, monthIndex));
  if (!cached) {
    installerDayEvents = [];
    return;
  }
  try {
    installerDayEvents = filterInstallerDayEvents(JSON.parse(cached));
  } catch (_) {
    installerDayEvents = [];
  }
}

async function loadInstallerDayEvents(year, monthIndex) {
  if (!currentInstaller || !sb) return;
  const settingKey = getInstallerDayEventSettingKey(year, monthIndex);
  const { data, error } = await sb
    .from('global_settings')
    .select('value')
    .eq('company_id', currentInstaller.company_id)
    .eq('key', settingKey)
    .maybeSingle();

  if (error) throw error;
  const filteredEvents = filterInstallerDayEvents(data?.value);
  localStorage.setItem(
    getInstallerDayEventCacheKey(year, monthIndex),
    JSON.stringify(filteredEvents)
  );
  if (year === currentYear && monthIndex === currentMonth) {
    installerDayEvents = filteredEvents;
  }
}

async function syncData() {
  if (!currentInstaller || !sb) return;

  const banner = document.getElementById('sync-status');
  const bannerText = document.getElementById('sync-text');
  bannerText.innerText = 'Syncing calendar...';
  banner.classList.remove('offline');

  try {
    try {
      const { data: serviceCatalog, error: serviceCatalogError } = await sb.rpc('get_installer_service_catalog_v2', {
        p_token: getInstallerSessionToken()
      });
      if (serviceCatalogError) throw serviceCatalogError;
      installerServiceCatalog = Array.isArray(serviceCatalog) ? serviceCatalog : [];
      localStorage.setItem(
        `bk_installer_service_catalog_${currentInstaller.company_id}`,
        JSON.stringify(installerServiceCatalog)
      );
      drawJobTracker();
    } catch (serviceCatalogError) {
      console.error('Service catalog could not be synced:', serviceCatalogError);
    }

    const { data: payoutProfile, error: payoutProfileError } = await sb
      .rpc('get_installer_payout_profile', {
        p_token: getInstallerSessionToken()
      })
      .maybeSingle();

    if (payoutProfileError) throw payoutProfileError;
    if (!payoutProfile) {
      handleLogout('expired');
      return;
    }

    Object.assign(currentInstaller, payoutProfile);
    try {
      const { data: profileDetails, error: profileDetailsError } = await sb
        .rpc('get_installer_profile_details', { p_token: getInstallerSessionToken() })
        .maybeSingle();
      if (profileDetailsError) throw profileDetailsError;
      if (profileDetails) Object.assign(currentInstaller, profileDetails);
    } catch (profileDetailsError) {
      console.error('Installer profile details could not be synced:', profileDetailsError);
    }
    localStorage.setItem('bk_active_installer', JSON.stringify(currentInstaller));
    populateProfile();

    try {
      await loadInstallerDayEvents(currentYear, currentMonth);
    } catch (dayEventError) {
      console.error('Calendar events could not be synced:', dayEventError);
    }

    // Refresh the checklist while sharing any in-flight request from the Sign action.
    try {
      await ensureInstallerChecklistLoaded(true);
    } catch (checklistError) {
      console.error('Error syncing booking checklist:', checklistError);
    }

    // Fetch installer payout settings
    try {
      const { data: payoutSettingsRes } = await sb
        .from('global_settings')
        .select('value')
        .eq('key', 'installer_payout_settings')
        .eq('company_id', currentInstaller.company_id)
        .maybeSingle();

      if (payoutSettingsRes && payoutSettingsRes.value) {
        installerPayoutSettings = payoutSettingsRes.value;
      } else {
        installerPayoutSettings = null;
      }
      localStorage.setItem(`bk_installer_payout_settings_${currentInstaller.company_id}`, JSON.stringify(installerPayoutSettings));
    } catch (payoutSettingsErr) {
      console.error('Error syncing installer payout settings:', payoutSettingsErr);
    }

    try {
      const payoutKeys = ['salary_tracker_config', 'regular_payout_state', 'special_payout_state', 'prorated_salary_state', 'company_profile_config', 'payslip_template_config'];
      const [settingsResult, adjustmentsResult, reimbursementsResult, payslipsResult] = await Promise.all([
        sb.from('global_settings').select('key, value').eq('company_id', currentInstaller.company_id).in('key', payoutKeys),
        sb.from('employee_adjustments').select('id, amount, date, label, paid').eq('company_id', currentInstaller.company_id).eq('employee_id', currentInstaller.id),
        sb.from('employee_reimbursements').select('id, amount, date, label, paid').eq('company_id', currentInstaller.company_id).eq('employee_id', currentInstaller.id),
        sb.from('payslip_records').select('*').eq('company_id', currentInstaller.company_id).eq('employee_id', currentInstaller.id)
      ]);
      const settings = {};
      (settingsResult.data || []).forEach(row => { settings[row.key] = row.value || {}; });
      payoutTrackerData = {
        config: settings.salary_tracker_config || {},
        regularState: settings.regular_payout_state || {},
        specialState: settings.special_payout_state || {},
        proratedState: settings.prorated_salary_state || {},
        adjustments: adjustmentsResult.data || [],
        reimbursements: reimbursementsResult.data || [],
        payslipRecords: payslipsResult.data || [],
        companyProfile: settings.company_profile_config || {},
        payslipConfig: settings.payslip_template_config || {}
      };
    } catch (payoutDataError) {
      console.error('Error syncing payout tracker data:', payoutDataError);
    }

    // Fetch bookings for this company
    const { data, error } = await sb.rpc('get_installer_bookings', {
      p_token: getInstallerSessionToken()
    });

    if (error) throw error;

    // Fetch delivery bookings to map order_no/reference_id to status
    try {
      const { data: delivData } = await sb
        .rpc('get_installer_delivery_statuses', {
          p_token: getInstallerSessionToken()
        });
      deliveryBookingsMap = {};
      if (delivData) {
        delivData.forEach(d => {
          deliveryBookingsMap[d.reference_id] = d.status;
        });
      }
      localStorage.setItem('bk_delivery_bookings_map', JSON.stringify(deliveryBookingsMap));
    } catch (delivErr) {
      console.error('Error syncing delivery bookings map:', delivErr);
    }

    // Filter bookings client side where installer is assigned to the booking or any of its doors
    const myId = currentInstaller.id;
    dbBookings = (data || []).filter(b => {
      // Skip cancelled bookings
      if (b.status === 'cancelled') return false;

      // Check direct list
      let list = [];
      if (b.installers) {
        if (typeof b.installers === 'string') {
          try { list = JSON.parse(b.installers); } catch(_) {}
        } else if (Array.isArray(b.installers)) {
          list = b.installers;
        }
      }
      if (list.some(inst => inst.id === myId)) return true;

      // Check installer_id string mapping
      if (b.installer_id && b.installer_id.split(' | ').includes(myId)) return true;

      // Check per-door installers
      let doorsArr = [];
      if (b.doors) {
        if (typeof b.doors === 'string') {
          try { doorsArr = JSON.parse(b.doors); } catch(_) {}
        } else if (Array.isArray(b.doors)) {
          doorsArr = b.doors;
        }
      }
      const hasDoorMatch = doorsArr.some(d => {
        const dInsts = d.installers || [];
        return dInsts.some(inst => inst.id === myId);
      });
      
      return hasDoorMatch;
    });

    // Save to cache
    const cacheObj = {
      data: dbBookings,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(`bk_cache_${currentInstaller.id}`, JSON.stringify(cacheObj));

    updateSyncBanner(false, new Date());
    drawCalendar();
    drawAgenda();
    drawJobTracker();
    drawPayouts();
  } catch (err) {
    console.error('Sync failed:', err);
    updateSyncBanner(true);
  }
}

window.refreshInstallerCalendar = async function() {
  const button = document.getElementById('installer-refresh-btn');
  const overlay = document.getElementById('installer-refresh-overlay');
  if (!currentInstaller || !button || button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  overlay?.classList.add('open');
  overlay?.setAttribute('aria-hidden', 'false');
  try {
    await syncData();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
  }
};

function updateSyncBanner(isOffline, timestamp = null) {
  const banner = document.getElementById('sync-status');
  const bannerText = document.getElementById('sync-text');
  const timeEl = document.getElementById('sync-time');

  if (isOffline) {
    banner.classList.add('offline');
    bannerText.innerText = 'Offline Mode';
    if (timestamp) {
      timeEl.innerText = 'Synced: ' + timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      timeEl.innerText = '';
    }
  } else {
    banner.classList.remove('offline');
    bannerText.innerText = 'Connected & Synced';
    if (timestamp) {
      timeEl.innerText = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }
}
