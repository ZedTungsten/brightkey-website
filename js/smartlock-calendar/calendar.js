'use strict';

// --- Calendar Rendering ---
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
}

function drawCalendar() {
  document.getElementById('month-title').innerText = `${MONTH_NAMES[currentMonth]} ${currentYear}`;
  const container = document.getElementById('days-container');
  container.innerHTML = '';

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Pad previous month days
  for (let i = 0; i < firstDay; i++) {
    container.insertAdjacentHTML('beforeend', '<div class="day-cell other-month"></div>');
  }

  const today = new Date();

  // Populate month days
  for (let day = 1; day <= totalDays; day++) {
    const cellDate = new Date(currentYear, currentMonth, day);
    const dateStr = formatDateISO(cellDate);

    // Check if selected
    const isSelected = formatDateISO(activeDate) === dateStr;
    // Check if today
    const isToday = formatDateISO(today) === dateStr;

    // Find how many installations on this day
    const dayBookings = dbBookings.filter(b => b.scheduled_date === dateStr).sort((a, b) => {
      const aAfternoon = isAfternoon(a.scheduled_time);
      const bAfternoon = isAfternoon(b.scheduled_time);
      if (aAfternoon && !bAfternoon) return 1;
      if (!aAfternoon && bAfternoon) return -1;
      return 0;
    });
    const hasInstallations = dayBookings.length > 0;

    let underlineHtml = '';
    if (hasInstallations) {
      underlineHtml = '<div style="display:flex; justify-content:center; gap:2px; width:24px; position:absolute; bottom:6px; height:3px;">';
      dayBookings.forEach(b => {
        let doorsArr = [];
        if (typeof b.doors === 'string') {
          try { doorsArr = JSON.parse(b.doors); } catch(_) {}
        } else if (Array.isArray(b.doors)) {
          doorsArr = b.doors;
        }
        const isDone = doorsArr.length > 0 && doorsArr.every(d => d.completed);
        const hasUploadedMedia = doorsArr.length > 0 && doorsArr.every(d => d.media_urls && d.media_urls.length > 0);
        
        const isEvent = b.product_skus === 'Backjob' || b.product_skus === 'Ocular' || b.product_skus === 'Day off';
        let color = isAfternoon(b.scheduled_time) ? '#2563eb' : '#f97316'; // default blue/light orange
        if (isEvent) {
          color = '#991b1b'; // deep red for events
        } else if (isDone) {
          color = hasUploadedMedia ? '#22c55e' : '#eab308'; // green/yellow
        }
        underlineHtml += `<div style="flex:1; background:${color}; height:100%; border-radius:2.5px;"></div>`;
      });
      underlineHtml += '</div>';
    }

    const cellClass = `day-cell${isSelected ? ' selected' : ''}${isToday ? ' today' : ''}${hasInstallations ? ' has-installations' : ''}`;
    
    container.insertAdjacentHTML('beforeend', `
      <div class="${cellClass}" onclick="selectDay(${day})">
        ${day}
        ${underlineHtml}
      </div>
    `);
  }
}

function selectDay(day) {
  activeDate = new Date(currentYear, currentMonth, day);
  drawCalendar();
  drawAgenda();
}

function drawAgenda() {
  const list = document.getElementById('agenda-list');
  const title = document.getElementById('agenda-header-title');
  const dateStr = formatDateISO(activeDate);
  
  const friendlyDate = activeDate.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  title.innerText = `Installations for ${friendlyDate}`;
  list.innerHTML = '';

  const dayBookings = dbBookings.filter(b => b.scheduled_date === dateStr).sort((a, b) => {
    const aAfternoon = isAfternoon(a.scheduled_time);
    const bAfternoon = isAfternoon(b.scheduled_time);
    if (aAfternoon && !bAfternoon) return 1;
    if (!aAfternoon && bAfternoon) return -1;
    return 0;
  });

  if (dayBookings.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted); text-align:center; padding: 2rem 0; font-size:0.88rem;">No installations scheduled for this day.</div>';
    return;
  }

  dayBookings.forEach(b => {
    const addressParts = (b.customer_address || '').split(',');
    const cityStr = addressParts.length >= 2 ? addressParts[addressParts.length - 2].trim() : 'N/A';
    const timeVal = b.scheduled_time || 'AM Slot';

    let doorsArr = [];
    if (typeof b.doors === 'string') {
      try { doorsArr = JSON.parse(b.doors); } catch(_) {}
    } else if (Array.isArray(b.doors)) {
      doorsArr = b.doors;
    }

    let productsArr = [];
    if (typeof b.products === 'string') {
      try { productsArr = JSON.parse(b.products); } catch(_) {}
    } else if (Array.isArray(b.products)) {
      productsArr = b.products;
    }
    const skus = (b.product_skus || '').split(' | ');
    const names = (b.product_names || '').split(' | ');

    const hardwareProducts = productsArr.filter(p => p.sku !== 'ADD-ON LABOR');
    const hardwareSkus = skus.filter(s => s.trim() !== 'ADD-ON LABOR');
    const hardwareNames = names.filter(n => n.trim() !== 'ADD-ON LABOR');
    
    const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);

    const agendaRowCount = (doorsArr.length === 1)
      ? 1
      : (anyDoorHasAttachedProducts 
          ? doorsArr.length 
          : Math.max(doorsArr.length, hardwareProducts.length, hardwareSkus.length));

    const lines = [];
    for (let i = 0; i < agendaRowCount; i++) {
      const door = doorsArr[i];
      
      let sku = '';
      let isCancelled = false;

      if (anyDoorHasAttachedProducts) {
        const attachedSkusList = door?.products || [];
        sku = attachedSkusList.join(', ') || 'N/A';
        isCancelled = attachedSkusList.length > 0 && attachedSkusList.every(itemSku => {
          const pMatch = productsArr.find(p => p.sku === itemSku);
          return pMatch?.cancelled || false;
        });
      } else if (doorsArr.length === 1) {
        const allSkusList = hardwareProducts.length > 0 ? hardwareProducts.map(p => p.sku) : hardwareSkus;
        sku = allSkusList.join(', ') || 'N/A';
        isCancelled = hardwareProducts.length > 0 && hardwareProducts.every(p => p.cancelled || false);
      } else {
        const currentSku = hardwareProducts[i]?.sku || hardwareSkus[i] || 'N/A';
        sku = currentSku;
        isCancelled = hardwareProducts[i]?.cancelled || false;
      }

      if (isCancelled) continue; // Skip cancelled products from being counted as active installations

      let doorInstallers = [];
      if (door && Array.isArray(door.installers)) {
        doorInstallers = door.installers;
      } else {
        if (b.installers) {
          if (typeof b.installers === 'string') {
            try { doorInstallers = JSON.parse(b.installers); } catch(_) {}
          } else if (Array.isArray(b.installers)) {
            doorInstallers = b.installers;
          }
        } else if (b.installer_name) {
          doorInstallers = b.installer_name.split(' | ').map(name => ({ name }));
        }
      }
      const installersText = doorInstallers.length > 0 
        ? doorInstallers.map(inst => {
            const name = formatInstallerName(inst.name || inst);
            return inst.role ? `[${inst.role.charAt(0).toUpperCase() + inst.role.slice(1)}] ${name}` : name;
          }).join(', ')
        : 'Unassigned';

      const doorDone = door?.completed || false;
      const statusIcon = doorDone 
        ? `<svg viewBox="0 0 24 24" style="width: 0.85em; height: 0.85em; fill: none; stroke: var(--success); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; display: inline-block; vertical-align: middle; margin-right: 0.25rem;"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<span style="color: var(--text-muted); margin-right: 0.35rem; font-weight: 700; display: inline-block; vertical-align: middle;">—</span>`;

      lines.push(`
        <div style="display: flex; align-items: center; margin-bottom: 0.15rem; line-height: 1.25;">
          ${statusIcon}
          <span>${escapeHtml(installersText)} - ${escapeHtml(sku)}</span>
        </div>
      `);
    }
    const installerSkuListHtml = lines.length > 0 ? lines.join('') : 'Smart Lock Service';


    const isDone = doorsArr.length > 0 && doorsArr.every(d => {
      const attachedSkus = d.products || [];
      const allProductsCancelled = attachedSkus.length > 0 && attachedSkus.every(sku => {
        const matchedProd = productsArr.find(p => p.sku === sku);
        return matchedProd ? !!matchedProd.cancelled : false;
      });
      return d.completed || allProductsCancelled;
    });

    const hasMedia = doorsArr.some(d => {
      const attachedSkus = d.products || [];
      const allProductsCancelled = attachedSkus.length > 0 && attachedSkus.every(sku => {
        const matchedProd = productsArr.find(p => p.sku === sku);
        return matchedProd ? !!matchedProd.cancelled : false;
      });
      return (d.media_urls && d.media_urls.length > 0) || allProductsCancelled;
    });

    const isEvent = b.product_skus === 'Backjob' || b.product_skus === 'Ocular' || b.product_skus === 'Day off';
    const hasCompleteMedia = doorsArr.length > 0 && doorsArr.every(d => {
      const attachedSkus = d.products || [];
      const allProductsCancelled = attachedSkus.length > 0 && attachedSkus.every(sku => {
        const matchedProd = productsArr.find(p => p.sku === sku);
        return matchedProd ? !!matchedProd.cancelled : false;
      });
      if (allProductsCancelled) return true;

      if (isEvent || !bookingMediaRequirements || bookingMediaRequirements.length === 0) {
        return d.media_urls && d.media_urls.length > 0;
      }
      return bookingMediaRequirements.every(req => {
        if (req.label === 'Work Permit' && !b.needs_work_permit) {
          return true;
        }
        return d.required_media && d.required_media[req.label];
      });
    });

    const isDayOff = b.product_skus === 'Day off';
    let cardClass = isDayOff ? 'booking-card day-off' : (isAfternoon(timeVal) ? 'booking-card afternoon' : 'booking-card morning');
    if (isDone) {
      cardClass += ' completed-booking';
    }
    if (isDone && hasCompleteMedia) {
      cardClass += ' all-media-done';
    }

    let badgesHtml = '';
    if (isDone || hasMedia) {
      badgesHtml = `<div style="display:flex; gap:0.35rem; align-items:center; margin-bottom:0.25rem;">`;
      if (isDone) {
        badgesHtml += `
          <div style="width:20px; height:20px; background:#22C55E; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; color:#fff;" title="Installation Done">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </div>
        `;
      }
      if (hasMedia) {
        badgesHtml += `
          <div style="width:20px; height:20px; background:#22C55E; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; color:#fff;" title="Media Uploaded">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          </div>
        `;
      }
      badgesHtml += `</div>`;
    }

    const isDeviceReceived = deliveryBookingsMap[b.order_no] === 'delivered';
    let deviceBadgeHtml = '';
    if (isDeviceReceived) {
      deviceBadgeHtml = `
        <span style="font-size:0.68rem; font-weight:700; background:#F97316; color:#fff; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase; letter-spacing:0.02em; line-height:1.2;">
          Device Received
        </span>
      `;
    }

    list.insertAdjacentHTML('beforeend', `
      <div class="${cardClass}" onclick="openDetailsModal('${b.id}')">
        <div class="booking-card-top">
          <span class="booking-time">${escapeHtml(timeVal)}</span>
          ${deviceBadgeHtml}
        </div>
        ${badgesHtml}
        <div class="booking-client">${escapeHtml((isEvent && (!b.customer_name || b.customer_name.toLowerCase() === 'none')) ? b.product_skus : b.customer_name)}</div>
        <div class="booking-city">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          ${escapeHtml(cityStr)}
        </div>
        <div class="booking-details-summary">
          ${installerSkuListHtml}
        </div>
      </div>
    `);
  });
}
