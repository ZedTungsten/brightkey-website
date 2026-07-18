'use strict';

// --- Offline Caching & Sync ---
function loadCachedBookings() {
  if (!currentInstaller) return;
  const cacheKey = `bk_cache_${currentInstaller.id}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    try {
      const { data, timestamp } = JSON.parse(cached);
      dbBookings = data || [];
      updateSyncBanner(true, new Date(timestamp));
      drawCalendar();
      drawAgenda();
    } catch (_) {}
  }

  const cachedChecklist = localStorage.getItem('bk_booking_checklist');
  if (cachedChecklist) {
    try {
      bookingChecklist = JSON.parse(cachedChecklist);
    } catch (_) {}
  }

  const cachedMediaReqs = localStorage.getItem('bk_booking_media_requirements');
  if (cachedMediaReqs) {
    try {
      bookingMediaRequirements = JSON.parse(cachedMediaReqs);
    } catch (_) {}
  }

  const cachedDelivery = localStorage.getItem('bk_delivery_bookings_map');
  if (cachedDelivery) {
    try {
      deliveryBookingsMap = JSON.parse(cachedDelivery);
    } catch (_) {}
  }

  const cachedPayoutSettings = localStorage.getItem('bk_installer_payout_settings');
  if (cachedPayoutSettings) {
    try {
      installerPayoutSettings = JSON.parse(cachedPayoutSettings);
    } catch (_) {}
  }
}

async function syncData() {
  if (!currentInstaller || !sb) return;

  const banner = document.getElementById('sync-status');
  const bannerText = document.getElementById('sync-text');
  bannerText.innerText = 'Syncing calendar...';
  banner.classList.remove('offline');

  try {
    // Fetch fresh installer record
    const { data: freshEmp } = await sb
      .from('employees')
      .select('id, first_name, last_name, contact_number, company_id, assignment, email, department, title, employment_status')
      .eq('id', currentInstaller.id)
      .maybeSingle();
    if (freshEmp) {
      currentInstaller = freshEmp;
      localStorage.setItem('bk_active_installer', JSON.stringify(freshEmp));
      document.getElementById('display-installer-name').innerText = `${currentInstaller.first_name} ${currentInstaller.last_name}`;
      populateProfile();
    }

    // Fetch booking checklist
    const { data: checklistRes } = await sb
      .from('global_settings')
      .select('value')
      .eq('key', 'booking_checklist')
      .eq('company_id', currentInstaller.company_id)
      .maybeSingle();

    if (checklistRes && checklistRes.value && Array.isArray(checklistRes.value)) {
      bookingChecklist = checklistRes.value;
    } else {
      bookingChecklist = defaultChecklist;
    }
    localStorage.setItem('bk_booking_checklist', JSON.stringify(bookingChecklist));

    // Fetch booking media requirements
    try {
      const { data: mediaReqsRes } = await sb
        .from('global_settings')
        .select('value')
        .eq('key', 'booking_media_requirements')
        .eq('company_id', currentInstaller.company_id)
        .maybeSingle();

      if (mediaReqsRes && mediaReqsRes.value && Array.isArray(mediaReqsRes.value)) {
        bookingMediaRequirements = mediaReqsRes.value;
      } else {
        bookingMediaRequirements = [];
      }
      localStorage.setItem('bk_booking_media_requirements', JSON.stringify(bookingMediaRequirements));
    } catch (mediaErr) {
      console.error('Error syncing media requirements:', mediaErr);
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
        installerPayoutSettings = {
          installations_before_crediting: 15,
          lead_credit: 1.0,
          assist_credit: 0.5,
          lead_rate: 1000,
          assist_rate: 500,
          extra_services: [
            { sku: 'BASEPLATE-M', rate: 700 },
            { sku: 'BASEPLATE-S', rate: 700 }
          ]
        };
      }
      localStorage.setItem('bk_installer_payout_settings', JSON.stringify(installerPayoutSettings));
    } catch (payoutSettingsErr) {
      console.error('Error syncing installer payout settings:', payoutSettingsErr);
    }

    // Fetch bookings for this company
    const { data, error } = await sb
      .from('installation_bookings')
      .select('*')
      .eq('company_id', currentInstaller.company_id);

    if (error) throw error;

    // Fetch delivery bookings to map order_no/reference_id to status
    try {
      const { data: delivData } = await sb
        .from('delivery_bookings')
        .select('reference_id, status')
        .eq('company_id', currentInstaller.company_id);
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
  } catch (err) {
    console.error('Sync failed:', err);
    updateSyncBanner(true);
  }
}

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
