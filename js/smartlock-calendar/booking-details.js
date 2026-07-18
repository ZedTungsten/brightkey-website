'use strict';

// --- Modal Sheets & Lightbox ---
function openDetailsModal(bookingId) {
  const b = dbBookings.find(booking => booking.id === bookingId);
  if (!b) return;

  selectedBooking = b;

  const isDeviceReceived = deliveryBookingsMap[b.order_no] === 'delivered';
  const badgeEl = document.getElementById('det-device-received-badge');
  if (badgeEl) {
    badgeEl.style.display = isDeviceReceived ? 'inline-block' : 'none';
  }

  document.getElementById('det-date').innerText = b.scheduled_date ? formatDateFriendly(b.scheduled_date) : 'N/A';
  document.getElementById('det-time').innerText = b.scheduled_time || 'AM Slot';
  document.getElementById('det-name').innerText = b.customer_name || 'N/A';
  document.getElementById('det-phone').innerText = b.customer_phone || 'N/A';
  
  const addressParts = (b.customer_address || '').split(',').map(p => p.trim());
  let location = 'N/A';
  let cleanAddress = b.customer_address || 'N/A';

  if (addressParts.length >= 2) {
    const lastPart = addressParts[addressParts.length - 1];
    const cleanProvince = lastPart.replace(/\s*\d+$/, '').trim(); 
    const cityPart = addressParts[addressParts.length - 2];
    
    location = `${cityPart}, ${cleanProvince}`;

    const streetParts = addressParts.slice(0, -2);
    if (streetParts.length > 0) {
      cleanAddress = streetParts.join(', ');
    }
  }
  
  document.getElementById('det-location').innerText = location;
  document.getElementById('det-address').innerText = cleanAddress;

  const mapPinEl = document.getElementById('det-map-pin');
  if (b.google_map_pin_url) {
    mapPinEl.innerHTML = `<a href="${b.google_map_pin_url}" target="_blank">Open Google Maps Pin ↗</a>`;
  } else {
    mapPinEl.innerText = 'No link provided';
  }

  document.getElementById('det-notes').innerText = b.notes || 'N/A';

  const grandTotalVal = b.grand_total || 0;
  const collectTotalGroup = document.getElementById('det-collect-total-group');
  if (collectTotalGroup) {
    if (b.show_total_to_installers !== false) {
      collectTotalGroup.style.display = 'flex';
      document.getElementById('det-collect-total').innerText = (grandTotalVal / 100).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
    } else {
      collectTotalGroup.style.display = 'none';
    }
  }

  // Attachments frontage & map
  const attachmentsGroup = document.getElementById('det-attachments-group');
  const frontageCard = document.getElementById('det-frontage-card');
  const frontageImg = document.getElementById('det-frontage-img');
  const mapCard = document.getElementById('det-map-card');
  const mapImg = document.getElementById('det-map-img');
  const permitCard = document.getElementById('det-permit-card');
  const permitImg = document.getElementById('det-permit-img');

  let hasAttachments = false;

  if (b.frontage_image_url) {
    frontageCard.style.display = 'flex';
    frontageImg.src = b.frontage_image_url;
    hasAttachments = true;
  } else {
    frontageCard.style.display = 'none';
  }

  if (b.map_image_url) {
    mapCard.style.display = 'flex';
    mapImg.src = b.map_image_url;
    hasAttachments = true;
  } else {
    mapCard.style.display = 'none';
  }

  if (b.work_permit_image_url) {
    permitCard.style.display = 'flex';
    permitImg.src = b.work_permit_image_url;
    hasAttachments = true;
  } else {
    permitCard.style.display = 'none';
  }

  if (attachmentsGroup) {
    attachmentsGroup.style.display = hasAttachments ? 'flex' : 'none';
  }

  // Parse doors specifications
  const doorsContainer = document.getElementById('det-doors-container');
  doorsContainer.innerHTML = '';

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

  // Check if any door has attached products (new style)
  const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);

  const rowCount = (doorsArr.length === 1)
    ? 1
    : (anyDoorHasAttachedProducts 
        ? doorsArr.length 
        : Math.max(doorsArr.length, hardwareProducts.length, hardwareSkus.length));

  if (rowCount === 0) {
    doorsContainer.innerHTML = '<span style="color:var(--text-muted); font-size:0.82rem;">No specifications found.</span>';
  } else {
    for (let i = 0; i < rowCount; i++) {
      const door = doorsArr[i];
      
      let sku = '';
      let titleHtml = '';
      let isCancelled = false;

      if (anyDoorHasAttachedProducts) {
        const attachedSkusList = door?.products || [];
        sku = attachedSkusList.join(', ') || 'N/A';
        const doorTitles = attachedSkusList.map(itemSku => {
          const pMatch = productsArr.find(p => p.sku === itemSku);
          let t = itemSku;
          if (pMatch) {
            t = pMatch.name || pMatch.title || itemSku;
          } else {
            const idx = skus.indexOf(itemSku);
            if (idx !== -1) {
              t = names[idx] || itemSku;
            }
          }
          return `<strong>${escapeHtml(itemSku)}</strong> - ${escapeHtml(t)}`;
        });
        titleHtml = doorTitles.map(tHtml => `<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.4rem;">${tHtml}</div>`).join('');
        isCancelled = attachedSkusList.length > 0 && attachedSkusList.every(itemSku => {
          const pMatch = productsArr.find(p => p.sku === itemSku);
          return pMatch?.cancelled || false;
        });
      } else if (doorsArr.length === 1) {
        // Combine all products to Door 1
        const allSkusList = hardwareProducts.length > 0 ? hardwareProducts.map(p => p.sku) : hardwareSkus;
        sku = allSkusList.join(', ') || 'N/A';
        
        const doorTitles = allSkusList.map(itemSku => {
          const pMatch = productsArr.find(p => p.sku === itemSku);
          let t = itemSku;
          if (pMatch) {
            t = pMatch.title || pMatch.name || itemSku;
          } else {
            const idx = skus.indexOf(itemSku);
            if (idx !== -1) {
              t = names[idx] || itemSku;
            }
          }
          return `<strong>${escapeHtml(itemSku)}</strong> - ${escapeHtml(t)}`;
        });
        
        titleHtml = doorTitles.map(tHtml => `<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.4rem;">${tHtml}</div>`).join('');
        isCancelled = hardwareProducts.length > 0 && hardwareProducts.every(p => p.cancelled || false);
      } else {
        const currentSku = hardwareProducts[i]?.sku || hardwareSkus[i] || 'N/A';
        sku = currentSku;
        let currentTitle = hardwareProducts[i]?.title || hardwareNames[i] || 'N/A';
        if (currentTitle === 'N/A' || currentTitle === currentSku) {
          currentTitle = '';
        }
        titleHtml = `<div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:0.4rem;"><strong>${escapeHtml(sku)}</strong>${currentTitle ? ` - ${escapeHtml(currentTitle)}` : ''}</div>`;
        isCancelled = hardwareProducts[i]?.cancelled || false;
      }

      const doorMaterial = door?.doorMaterial || 'N/A';
      const jambMaterial = door?.jambMaterial || 'N/A';
      const swing = door?.swing || 'N/A';

      // Photo thumbnails
      let photosHtml = '';
      if (door?.photos && door.photos.length > 0) {
        photosHtml = `
          <div class="photo-strip">
            ${door.photos.map(url => `
              <img class="photo-thumb" src="${url}" alt="Door Photo" onclick="openLightbox('${url}')" />
            `).join('')}
          </div>
        `;
      }

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
      const assignedText = doorInstallers.length > 0 
        ? doorInstallers.map(inst => formatInstallerName(inst.name || inst)).join(', ') 
        : 'Unassigned';

      const isAssignedToThisDoor = doorInstallers.some(inst => {
        if (inst.id === currentInstaller.id) return true;
        const cleanInstallerName = `${currentInstaller.first_name} ${currentInstaller.last_name}`.trim().toLowerCase();
        const cleanInstName = (inst.name || '').trim().toLowerCase();
        if (cleanInstName && (cleanInstallerName.includes(cleanInstName) || cleanInstName.includes(cleanInstallerName))) return true;
        return false;
      });

      // Check if this specific door has addon labor
      const doorHasAddonLabor = productsArr.some(p => p.sku === 'ADD-ON LABOR' && (p.doorIndex === i || (p.doorIndex === undefined && i === 0)));

      const doorCardClass = isCancelled 
        ? 'door-specs-card unassigned' 
        : (isAssignedToThisDoor ? 'door-specs-card assigned' : 'door-specs-card unassigned');
      
      const cardStyle = isCancelled ? 'opacity: 0.6;' : '';

      let doneButtonHtml = '';
      if (isCancelled) {
        doneButtonHtml = `
          <div style="position: absolute; top: 0.85rem; right: 1rem; display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end;">
            <span style="font-size: 0.83rem; font-weight: 700; background: var(--danger); color: #fff; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); text-transform: uppercase;">Cancelled</span>
          </div>
        `;
      } else if (isAssignedToThisDoor) {
        const isEvent = selectedBooking.product_skus === 'Backjob' || selectedBooking.product_skus === 'Ocular' || selectedBooking.product_skus === 'Day off';
        if (door?.completed) {
          doneButtonHtml = `
            <div style="position: absolute; top: 0.85rem; right: 1rem; display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end;">
              <span style="font-size: 0.83rem; font-weight: 700; background: #6b7280; color: #fff; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); text-transform: uppercase; display:inline-flex; align-items:center; gap:0.25rem;"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><polyline points="20 6 9 17 4 12"/></svg>Completed</span>
              <button type="button" class="btn btn-sm" style="width: auto; font-size: 0.83rem; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); background: var(--cyan); color: #fff; border: none; cursor: pointer;" onclick="openUploadModal(${i})">Upload Media</button>
            </div>
          `;
        } else {
          const clickAction = isEvent ? `markEventDoorDone(${i}, this)` : `openChecklistModal(${i})`;
          doneButtonHtml = `
            <div style="position: absolute; top: 0.85rem; right: 1rem; display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-end;">
              <button type="button" class="btn btn-sm" style="width: auto; font-size: 0.83rem; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); background: var(--success); color: #fff; border: none; cursor: pointer;" onclick="${clickAction}">Done</button>
            </div>
          `;
        }
      }

      let addonLaborBottomHtml = '';
      if (doorHasAddonLabor) {
        addonLaborBottomHtml = `
          <div style="margin-top: 0.5rem; display: flex; justify-content: flex-end; align-items: center;">
            <span style="font-size: 0.68rem; font-weight: 700; background: #FEF08A; color: #854D0E; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm); text-transform: uppercase; letter-spacing: 0.05em; display: inline-flex; align-items: center;">
              Added Labor
            </span>
          </div>
        `;
      } else if (isAssignedToThisDoor && !isCancelled) {
        addonLaborBottomHtml = `
          <div style="margin-top: 0.5rem; display: flex; justify-content: flex-end; align-items: center;">
            <button type="button" class="btn btn-sm" style="width: auto; font-size: 0.83rem; padding: 0.3rem 0.7rem; border-radius: var(--radius-sm); background: var(--cyan-light); color: #fff; border: none; cursor: pointer;" onclick="promptAddLabor(${i})">Add Labor</button>
          </div>
        `;
      }

      let signatureHtml = '';
      if (door?.completed && door.signature) {
        signatureHtml = `
          <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.2rem;">
            <span class="info-lbl" style="font-size:0.6rem;">Customer Signature Logged</span>
            <img src="${door.signature}" alt="Customer Signature" style="max-height: 40px; width: auto; align-self: flex-start; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;" onclick="openChecklistModal(${i}, true)" />
          </div>
        `;
      }

      let finishedMediaHtml = '';
      const mediaUrls = (door?.media_urls && door.media_urls.length > 0) ? door.media_urls : [];
      let mediaStripHtml = '';
      if (mediaUrls.length > 0) {
        mediaStripHtml = `
          <div class="photo-strip">
            ${mediaUrls.map(url => {
              const isVid = /\.(mp4|mov|webm)(\?|$)/i.test(url);
              if (isVid) {
                return `
                  <div class="photo-thumb" style="display:flex; align-items:center; justify-content:center; background:#000; color:#fff; cursor:pointer; position:relative; width: 70px; height: 70px; border-radius: var(--radius-sm); border: 1px solid var(--border);" onclick="openLightbox('${url}')">
                    <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:currentColor;stroke:none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </div>
                `;
              } else {
                return `<img class="photo-thumb" src="${url}" alt="Finished Media" onclick="openLightbox('${url}')" />`;
              }
            }).join('')}
          </div>
        `;
      } else {
        mediaStripHtml = `<div style="font-size:0.75rem; color:var(--text-muted); text-align:center; padding:0.25rem 0; font-weight:normal;">No media uploaded yet.</div>`;
      }

      finishedMediaHtml = `
        <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.3rem;">
          <span class="info-lbl" style="font-size:0.65rem;">Installer Uploaded Media</span>
          ${mediaStripHtml}
        </div>
      `;

      doorsContainer.insertAdjacentHTML('beforeend', `
        <div class="${doorCardClass}" style="${cardStyle}">
          ${doneButtonHtml}
          <div style="font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 0.25rem; letter-spacing: 0.05em;">
            ${escapeHtml(assignedText)}
          </div>
          <h5>Door ${i + 1}</h5>
          ${titleHtml}
          <div class="door-details-grid">
            <div>
              <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Door</div>
              <strong>${escapeHtml(doorMaterial)}</strong>
            </div>
            <div>
              <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Jamb</div>
              <strong>${escapeHtml(jambMaterial)}</strong>
            </div>
            <div>
              <div style="color:var(--text-muted); font-size:0.65rem; text-transform:uppercase;">Swing</div>
              <strong>${escapeHtml(swing)}</strong>
            </div>
          </div>
          ${photosHtml}
          ${signatureHtml}
          ${finishedMediaHtml}
          ${addonLaborBottomHtml}
        </div>
      `);
    }
  }

  document.getElementById('details-modal').style.display = 'flex';
}

function closeDetailsModal() {
  document.getElementById('details-modal').style.display = 'none';
}

window.openLightbox = function(url) {
  const modal = document.getElementById('lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const vid = document.getElementById('lightbox-video');
  
  const isVid = /\.(mp4|mov|webm)(\?|$)/i.test(url);
  if (isVid) {
    img.style.display = 'none';
    img.src = '';
    vid.src = url;
    vid.style.display = 'block';
  } else {
    vid.style.display = 'none';
    vid.src = '';
    img.src = url;
    img.style.display = 'block';
  }
  modal.style.display = 'flex';
};

window.closeLightbox = function() {
  const modal = document.getElementById('lightbox-modal');
  modal.style.display = 'none';
  const vid = document.getElementById('lightbox-video');
  if (vid) {
    vid.pause();
    vid.src = '';
  }
};
