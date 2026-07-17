    'use strict';

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

      document.getElementById('det-orderno').innerText = selectedBooking.order_no || 'N/A';
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

      const showTotalChk = document.getElementById('det-show-total-installers');
      if (showTotalChk) {
        showTotalChk.checked = selectedBooking.show_total_to_installers !== false;
      }

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
      const qtys = (selectedBooking.product_qtys || '').split(' | ');

      // Calculate excess products relative to receipt
      const receiptSkuCounts = {};
      if (productsArr && productsArr.length > 0) {
        productsArr.forEach(p => {
          if (!p.cancelled) {
            receiptSkuCounts[p.sku] = (receiptSkuCounts[p.sku] || 0) + (p.qty || 1);
          }
        });
      } else {
        skus.forEach((sku, idx) => {
          if (sku && sku !== 'ADD-ON LABOR') {
            const qty = parseInt(qtys[idx] || '1', 10) || 1;
            receiptSkuCounts[sku] = (receiptSkuCounts[sku] || 0) + qty;
          }
        });
      }

      const doorSkuCounts = {};
      doorsArr.forEach(door => {
        const attachedSkus = door.products || [];
        attachedSkus.forEach(sku => {
          doorSkuCounts[sku] = (doorSkuCounts[sku] || 0) + 1;
        });
      });

      const excessRemaining = {};
      Object.keys(doorSkuCounts).forEach(sku => {
        const receiptCount = receiptSkuCounts[sku] || 0;
        const doorCount = doorSkuCounts[sku] || 0;
        if (doorCount > receiptCount) {
          excessRemaining[sku] = doorCount - receiptCount;
        }
      });

      const excessProductInstances = {};
      for (let d = doorsArr.length - 1; d >= 0; d--) {
        const door = doorsArr[d];
        const attachedSkus = door.products || [];
        for (let p = attachedSkus.length - 1; p >= 0; p--) {
          const sku = attachedSkus[p];
          if (excessRemaining[sku] > 0) {
            excessProductInstances[`${d}-${p}`] = true;
            excessRemaining[sku]--;
          }
        }
      }
      
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
              const matchedProd = productsArr.find(p => p.sku === sku);
              if (matchedProd) {
                doorProducts.push(matchedProd);
              } else {
                doorProducts.push({ sku: sku, name: sku, title: sku });
              }
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
          let productCellHtml = `<div style="font-weight: 800; color: var(--cyan); margin-bottom: 0.4rem; font-size: 0.85rem;">Door ${i + 1}</div>`;
          
          if (doorProducts.length === 0) {
            productCellHtml += `<span style="color:var(--text-muted); font-size:0.75rem;">No products attached</span>`;
          } else {
            productCellHtml += doorProducts.map((p, pIdx) => {
              const isCancelled = p.cancelled || false;
              let title = p.name || p.title || p.sku || 'N/A';
              if (title.startsWith(p.sku + ' - ')) {
                title = title.substring(p.sku.length + 3);
              } else if (title.startsWith(p.sku + '-')) {
                title = title.substring(p.sku.length + 1);
              }
              const isExcess = excessProductInstances[`${i}-${pIdx}`];
              return `
                <div style="margin-bottom: 0.25rem; ${isCancelled ? 'opacity: 0.55; text-decoration: line-through;' : ''} ${isExcess ? 'color: var(--danger);' : ''}">
                  <strong>${escapeHtml(p.sku)}</strong> - <span style="${isExcess ? 'color: var(--danger);' : 'color: var(--text-secondary);'}">${escapeHtml(title)}</span>
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

          const isBraceletOrAccessory = !isCancelled;
          const instCellHtml = isBraceletOrAccessory ? `
            <div id="door-inst-container-general-${i}">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                <span id="door-inst-text-general-${i}">${escapeHtml(generalInstallersHtml)}</span>
                <button type="button" class="btn-minimal" onclick="editBookingInstallers(${i})" title="Edit Installers">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
              </div>
            </div>
          ` : escapeHtml(generalInstallersHtml);

          const skuUpper = sku.toUpperCase();
          const isLock = sku !== 'ADD-ON LABOR' &&
                         skuUpper !== 'BACKJOB' &&
                         skuUpper !== 'OCULAR' &&
                         skuUpper !== 'DAY OFF' &&
                         !skuUpper.includes('BRACELET') &&
                         !skuUpper.includes('BASEPLATE') &&
                         !skuUpper.includes('LABOR') &&
                         !skuUpper.includes('KEY');
          const isUnallocatedLock = isLock && !isCancelled;

          const textStyle = isUnallocatedLock ? 'color: #EF4444; font-weight: 700;' : 'color: var(--text-secondary);';
          const skuStyle = isUnallocatedLock ? 'color: #EF4444; font-weight: 800;' : '';
          const badgeHtml = isUnallocatedLock ? '<span style="background: rgba(239, 68, 68, 0.1); color: #EF4444; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 9999px; margin-left: 0.35rem; text-transform: uppercase;">unallocated</span>' : '';

          tbody.insertAdjacentHTML('beforeend', `
            <tr ${trStyle}>
              <td>
                <strong style="${skuStyle}">${escapeHtml(sku)}</strong> - <span style="${textStyle}">${escapeHtml(title)}</span>${badgeHtml}
                ${isCancelled ? '<br/><span style="color:var(--danger);font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Cancelled</span>' : ''}
              </td>
              <td>N/A</td>
              <td>N/A</td>
              <td>${instCellHtml}</td>
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

    window.toggleBookingShowTotal = async function(isChecked) {
      if (!selectedBooking) return;
      try {
        const { error } = await sb
          .from('installation_bookings')
          .update({ show_total_to_installers: isChecked })
          .eq('id', selectedBooking.id);
        if (error) throw error;
        selectedBooking.show_total_to_installers = isChecked;
        showToast("Installer total visibility updated successfully.");
      } catch (err) {
        console.error("Error updating visibility:", err);
        showToast("Failed to update visibility: " + err.message, true);
      }
    };

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
