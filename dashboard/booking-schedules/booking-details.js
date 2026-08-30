    'use strict';

    function getBookingCustomerIdentity(record = {}) {
      const text = value => String(value || '').trim();
      const isCompany = record.customer_is_company === true;
      const companyType = text(record.customer_company_type);
      return {
        isCompany,
        primaryName: isCompany ? text(record.customer_company_name) || text(record.customer_name) : [text(record.customer_first_name), text(record.customer_last_name)].filter(Boolean).join(' ') || text(record.customer_name),
        contactPerson: isCompany ? text(record.customer_contact_person) : '',
        companyType: isCompany && companyType ? companyType.charAt(0).toUpperCase() + companyType.slice(1) : '',
        social: text(record.customer_social),
        email: text(record.customer_email)
      };
    }

    function getCityFromAddress(address) {
      if (!address) return 'N/A';
      const parts = address.split(',');
      if (parts.length >= 2) {
        return parts[parts.length - 2].trim();
      }
      return 'N/A';
    }

    function renderMapPinLink(element, value) {
      const url = String(value || '').trim();
      element.replaceChildren();
      if (!url) {
        element.textContent = 'No link provided';
        return;
      }
      let parsed;
      try { parsed = new URL(url); } catch (_) { parsed = null; }
      if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
        element.textContent = 'Invalid map link';
        return;
      }
      const link = document.createElement('a');
      link.href = parsed.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = url;
      link.style.cssText = 'color:var(--blue);font-weight:600;overflow-wrap:anywhere;';
      element.appendChild(link);
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

    function getBookingProductDescription(sku, title) {
      const normalizedSku = String(sku || '').trim();
      let description = String(title || '').trim();
      if (normalizedSku && description.toLowerCase().startsWith(normalizedSku.toLowerCase())) {
        description = description.slice(normalizedSku.length).replace(/^[\s\-–—:|]+/, '').trim();
      }
      return description === normalizedSku ? '' : description;
    }

    function doorHasCompletionAssignment(door, booking, allDoors) {
      const parseList = value => {
        if (Array.isArray(value)) return value;
        try {
          const parsed = JSON.parse(value || '[]');
          return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
          return [];
        }
      };
      const hasRole = list => parseList(list).some(installer => {
        const role = String(installer?.role || 'lead').trim().toLowerCase();
        return ['lead', 'assist', 'service'].includes(role);
      });
      if (hasRole(door?.installers)) return true;

      const anyDoorAssigned = parseList(allDoors).some(item => parseList(item?.installers).length > 0);
      if (anyDoorAssigned) return false;
      return hasRole(booking?.installers) || Boolean(String(booking?.installer_id || '').trim());
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

    function ensureBookingDetailsStructure() {
      const grid = document.querySelector('#details-modal .booking-details-summary-grid');
      if (!grid || grid.dataset.structured === 'true') return;

      const icon = paths => `<span class="booking-info-row-icon"><svg viewBox="0 0 24 24">${paths}</svg></span>`;
      const createPanel = (title, headerPath, className) => {
        const panel = document.createElement('section');
        panel.className = `booking-info-panel ${className}`;
        panel.innerHTML = `<h3 class="booking-info-panel-title"><span class="booking-details-section-icon"><svg viewBox="0 0 24 24">${headerPath}</svg></span>${title}</h3><div class="booking-info-panel-list"></div>`;
        return panel;
      };
      const customer = createPanel('Customer Information', '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>', 'booking-info-customer');
      const booking = createPanel('Booking & Location', '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>', 'booking-info-location');
      const secondary = document.createElement('div');
      secondary.className = 'booking-info-secondary';
      const customerList = customer.querySelector('.booking-info-panel-list');
      const bookingList = booking.querySelector('.booking-info-panel-list');

      const moveRow = (valueId, target, iconPath, extraClass = '') => {
        const value = document.getElementById(valueId);
        const group = value?.closest('.details-group');
        if (!group) return;
        group.classList.add('booking-info-row');
        if (extraClass) group.classList.add(extraClass);
        group.insertAdjacentHTML('afterbegin', icon(iconPath));
        target.appendChild(group);
      };

      moveRow('det-name', customerList, '<circle cx="12" cy="8" r="4"></circle><path d="M5 21a7 7 0 0 1 14 0"></path>');
      moveRow('det-company-contact', customerList, '<circle cx="12" cy="8" r="4"></circle><path d="M5 21a7 7 0 0 1 14 0"></path>');
      moveRow('det-social', customerList, '<circle cx="12" cy="12" r="9"></circle><path d="m9 9 6 6M15 9l-6 6"></path>');
      moveRow('det-email', customerList, '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m3 7 9 6 9-6"></path>');
      moveRow('det-contact-1', customerList, '<path d="M5 4h4l2 5-3 2a14 14 0 0 0 5 5l2-3 5 2v4c0 1-1 2-2 2A17 17 0 0 1 3 6c0-1 1-2 2-2Z"></path>');
      moveRow('det-contact-2', customerList, '<path d="M5 4h4l2 5-3 2a14 14 0 0 0 5 5l2-3 5 2v4c0 1-1 2-2 2A17 17 0 0 1 3 6c0-1 1-2 2-2Z"></path>');

      const installDateRow = document.createElement('div');
      installDateRow.className = 'details-group booking-info-row';
      installDateRow.innerHTML = `${icon('<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 10h18"></path>')}<span class="details-label">Install Date</span><span class="details-value" id="det-date-details">-</span>`;
      bookingList.appendChild(installDateRow);
      moveRow('det-time', bookingList, '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>');
      moveRow('det-company-type', bookingList, '<path d="M4 21V5l8-3 8 3v16"></path><path d="M9 9h6M9 13h6M9 17h6"></path>');
      moveRow('det-city', bookingList, '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2"></circle>', 'booking-info-divider');
      moveRow('det-province', bookingList, '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2"></circle>');
      moveRow('det-address', bookingList, '<path d="m12 3 8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4Z"></path><path d="M9 11h6v6H9z"></path>');
      const makeSecondaryPanel = (title, path, className) => {
        const panel = document.createElement('section');
        panel.className = `booking-info-secondary-panel ${className}`;
        panel.innerHTML = `<h3 class="booking-info-panel-title"><span class="booking-details-section-icon"><svg viewBox="0 0 24 24">${path}</svg></span>${title}</h3><div class="booking-info-secondary-content"></div>`;
        secondary.appendChild(panel);
        return panel.querySelector('.booking-info-secondary-content');
      };

      const locationContent = makeSecondaryPanel('Location', '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2"></circle>', 'booking-location-panel');
      const notesContent = makeSecondaryPanel('Notes', '<path d="M5 3h11l3 3v15H5V3Z"></path><path d="M9 11h6M9 15h6M14 3v4h5"></path>', 'booking-notes-panel');
      moveRow('det-map-pin', locationContent, '');
      moveRow('det-notes', notesContent, '');
      locationContent.querySelector('.booking-info-row-icon')?.remove();
      notesContent.querySelector('.booking-info-row-icon')?.remove();
      const mapPreview = document.createElement('div');
      mapPreview.id = 'det-map-preview';
      mapPreview.className = 'booking-location-map';
      locationContent.appendChild(mapPreview);

      const attachmentsPanel = document.querySelector('.booking-attachments-panel');
      if (attachmentsPanel) {
        attachmentsPanel.classList.remove('booking-details-panel');
        attachmentsPanel.classList.add('booking-info-secondary-panel');
        const heading = attachmentsPanel.querySelector('.booking-details-section-title');
        if (heading) {
          heading.className = 'booking-info-panel-title';
          heading.lastChild.textContent = 'Files & Contracts';
        }
        attachmentsPanel.querySelectorAll('button').forEach(button => {
          if (button.textContent.trim() === 'Upload File') button.remove();
        });
        secondary.appendChild(attachmentsPanel);
      }

      grid.replaceChildren(customer, booking);
      grid.insertAdjacentElement('afterend', secondary);
      grid.dataset.structured = 'true';
    }

    function installerAvatarMarkup(installer) {
      const rawName = String(installer?.name || 'Installer').trim();
      const initials = rawName.split(/\s+/).filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase() || '?';
      const employeeId = installer?.employee_id || installer?.id || '';
      return `<span class="booking-installer-avatar" data-employee-id="${escapeHtml(String(employeeId))}" data-installer-name="${escapeHtml(rawName)}"><span>${escapeHtml(initials)}</span></span>`;
    }

    function hydrateInstallerAvatars(root) {
      const employees = typeof dbEmployees !== 'undefined' && Array.isArray(dbEmployees) ? dbEmployees : [];
      const normalize = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
      const isSafeProfileImage = value => /^(?:https?:\/\/|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i.test(String(value || '').trim());
      root.querySelectorAll('.booking-installer-avatar').forEach(avatar => {
        const employeeId = avatar.dataset.employeeId;
        const installerName = normalize(avatar.dataset.installerName);
        const installerParts = installerName.split(' ').filter(Boolean);
        const employee = employees.find(item => {
          const itemId = String(item.id || item.employee_id || '');
          if (employeeId && itemId === employeeId) return true;
          const fullName = normalize(item.name || `${item.first_name || ''} ${item.last_name || ''}`);
          if (!fullName || !installerName) return false;
          if (fullName === installerName) return true;
          const fullParts = fullName.split(' ').filter(Boolean);
          return fullParts[0] === installerParts[0]
            && (!installerParts[1] || fullParts.at(-1)?.startsWith(installerParts.at(-1)?.[0] || ''));
        });
        const pictureLink = employee?.picture_link;
        if (!isSafeProfileImage(pictureLink)) return;
        const image = document.createElement('img');
        image.src = pictureLink;
        image.alt = `${avatar.dataset.installerName || 'Installer'} profile picture`;
        image.addEventListener('error', () => image.remove(), { once: true });
        avatar.prepend(image);
      });
    }

    async function showBookingDetails(id) {
      // Installer updates can happen after this dashboard page was loaded.
      // Refresh the selected booking so media, signatures, and completion state are current.
      if (sb && id) {
        const { data: latestBooking, error: refreshError } = await sb
          .from('installation_bookings')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!refreshError && latestBooking) {
          const bookingIndex = dbBookings.findIndex(booking => booking.id === id);
          if (bookingIndex >= 0) {
            dbBookings[bookingIndex] = latestBooking;
          } else {
            dbBookings.push(latestBooking);
          }
        } else if (refreshError) {
          console.warn('Could not refresh booking details:', refreshError.message);
        }
      }

      selectedBooking = dbBookings.find(b => b.id === id);
      if (!selectedBooking) return;

      ensureBookingDetailsStructure();

      const companyTypeValue = String(selectedBooking.company_type || '').trim();
      const isCompanyCustomer = Boolean(companyTypeValue)
        && !/^(?:n\/?a|none|individual|personal|normal customer)$/i.test(companyTypeValue);
      ['det-company-contact', 'det-company-type'].forEach(id => {
        const row = document.getElementById(id)?.closest('.booking-info-row');
        if (row) row.hidden = !isCompanyCustomer;
      });

      toggleEditField('map-pin', false);
      toggleEditField('notes', false);

      // Show/hide abort button based on current status
      const isAborted = selectedBooking.status === 'cancelled';
      const abortBtn = document.getElementById('btn-abort-booking');
      const reschedBtn = document.getElementById('btn-reschedule-booking');
      if (abortBtn) abortBtn.style.display = isAborted ? 'none' : '';
      if (reschedBtn) reschedBtn.disabled = isAborted;

      const customerIdentity = getBookingCustomerIdentity(selectedBooking);
      document.getElementById('details-modal-title').innerText = selectedBooking.order_no || 'Order Number';
      document.getElementById('details-modal-customer').innerText = customerIdentity.primaryName || 'N/A';
      document.getElementById('det-date').innerText = selectedBooking.scheduled_date ? formatDateFriendly(selectedBooking.scheduled_date) : 'Unscheduled';
      document.getElementById('det-date-details').innerText = selectedBooking.scheduled_date ? formatDateFriendly(selectedBooking.scheduled_date) : 'Unscheduled';
      document.getElementById('det-time').innerText = selectedBooking.scheduled_time || 'AM Slot';
      document.getElementById('det-name-label').innerText = customerIdentity.isCompany ? 'Company Name' : 'Customer Name';
      document.getElementById('det-name').innerText = customerIdentity.primaryName || 'N/A';
      document.getElementById('det-company-contact-group').hidden = !customerIdentity.isCompany;
      document.getElementById('det-company-type-group').hidden = !customerIdentity.isCompany;
      document.getElementById('det-company-contact').innerText = customerIdentity.contactPerson || 'N/A';
      document.getElementById('det-company-type').innerText = customerIdentity.companyType || 'N/A';
      document.getElementById('det-social').innerText = customerIdentity.social || 'N/A';
      document.getElementById('det-email').innerText = customerIdentity.email || 'N/A';
      document.getElementById('det-contact-1').innerText = selectedBooking.customer_phone || 'N/A';
      document.getElementById('det-contact-2').innerText = selectedBooking.customer_phone_2 || 'N/A';
      document.getElementById('det-booked-date').innerText = selectedBooking.created_at ? formatDateFriendly(selectedBooking.created_at) : 'N/A';
      
      // City & Province
      const addressParts = (selectedBooking.customer_address || '').split(',').map(part => part.trim()).filter(Boolean);
      let city = String(selectedBooking.customer_city || '').trim() || 'N/A';
      let province = String(selectedBooking.customer_province || '').trim() || 'N/A';
      if (addressParts.length >= 2) {
        if (city === 'N/A') city = addressParts[addressParts.length - 2];
        if (province === 'N/A') province = addressParts[addressParts.length - 1];
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
      renderMapPinLink(mapPinEl, selectedBooking.google_map_pin_url);
      const mapPreviewEl = document.getElementById('det-map-preview');
      if (mapPreviewEl) {
        const mapQuery = [
          document.getElementById('det-address')?.textContent,
          document.getElementById('det-city')?.textContent,
          document.getElementById('det-province')?.textContent
        ].map(value => String(value || '').trim()).filter(value => value && value !== '-' && value.toUpperCase() !== 'N/A').join(', ');
        if (mapQuery) {
          const iframe = document.createElement('iframe');
          iframe.title = 'Booking location map';
          iframe.loading = 'lazy';
          iframe.referrerPolicy = 'no-referrer-when-downgrade';
          iframe.src = `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`;
          mapPreviewEl.replaceChildren(iframe);
          mapPreviewEl.hidden = false;
        } else {
          mapPreviewEl.replaceChildren();
          mapPreviewEl.hidden = true;
        }
      }

      // Notes
      const notesDisplay = document.getElementById('det-notes');
      notesDisplay.innerText = selectedBooking.notes || 'No notes';
      notesDisplay.classList.toggle('booking-notes-empty', !String(selectedBooking.notes || '').trim());

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

          const canCompleteWithoutSignature = !door?.completed
            && doorProducts.length > 0
            && doorProducts.some(product => !product.cancelled)
            && !doorHasCompletionAssignment(door, selectedBooking, doorsArr);
          const completionActionHtml = door?.completed
            ? '<span style="font-size:0.68rem;font-weight:700;color:var(--success);text-transform:uppercase;">Installed</span>'
            : (canCompleteWithoutSignature ? `
              <button type="button" class="btn btn-sm" id="btn-door-done-${i}" title="Mark done and upload completion proof" style="width:auto;height:28px;padding:0.25rem 0.65rem;background:var(--success);border-color:var(--success);color:#fff;" onclick="openDoorCompletionProofModal(${i})">Done</button>
            ` : '');

          // Build product cell content
          let productCellHtml = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;margin-bottom:0.4rem;">
              <div style="font-weight:800;color:var(--cyan);font-size:0.85rem;">Door ${i + 1}</div>
              <div style="display:flex;align-items:center;justify-content:flex-end;">${completionActionHtml}</div>
            </div>
          `;
          
          if (doorProducts.length === 0) {
            productCellHtml += `<span style="color:var(--text-muted); font-size:0.75rem;">No products attached</span>`;
          } else {
            productCellHtml += doorProducts.map((p, pIdx) => {
              const isCancelled = p.cancelled || false;
              const title = p.name || p.title || p.sku || 'N/A';
              const description = getBookingProductDescription(p.sku, title);
              const isExcess = excessProductInstances[`${i}-${pIdx}`];
              const catalogProduct = dbProductsBySku.get(String(p.sku || '').toUpperCase());
              const rawImageUrl = String(catalogProduct?.image_main || p.image_main || '').trim();
              const safeImageUrl = /^(https?:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(rawImageUrl)
                ? rawImageUrl
                : '';
              const productImageHtml = safeImageUrl
                ? `<img class="booking-product-image" src="${escapeHtml(safeImageUrl)}" alt="${escapeHtml(title)}" onerror="this.hidden=true;this.nextElementSibling.hidden=false;" /><span class="booking-product-image-fallback" hidden>${escapeHtml(String(p.sku || '').slice(0, 2))}</span>`
                : `<span class="booking-product-image-fallback">${escapeHtml(String(p.sku || '').slice(0, 2))}</span>`;
              const mismatchBadge = isExcess
                ? '<span style="background: rgba(239, 68, 68, 0.1); color: #EF4444; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 9999px; margin-left: 0.35rem; text-transform: uppercase;">AR mismatch</span>'
                : '';
              return `
                <div class="booking-product-summary" style="${isCancelled ? 'opacity: 0.55; text-decoration: line-through;' : ''} ${isExcess ? 'color: var(--danger);' : ''}">
                  <span class="booking-product-image-wrap">${productImageHtml}</span>
                  <span><strong>${escapeHtml(p.sku)}</strong>${description ? ` - <span style="${isExcess ? 'color: var(--danger);' : 'color: var(--text-secondary);'}">${escapeHtml(description)}</span>` : ''}${mismatchBadge}
                  ${isCancelled ? '<span style="color:var(--danger);font-size:0.7rem;font-weight:700;text-transform:uppercase;margin-left:0.3rem;text-decoration:none;display:inline-block;">Cancelled</span>' : ''}</span>
                </div>
              `;
            }).join('');
          }

          // Gallery strip / Installer uploads section
          // Older installer uploads may only exist in required_media/other_media.
          // Combine every supported source so the dashboard matches the installer calendar.
          const mediaUrlsList = [...new Set([
            ...(Array.isArray(door?.media_urls) ? door.media_urls : []),
            ...(
              door?.required_media && typeof door.required_media === 'object'
                ? Object.values(door.required_media)
                : []
            ),
            ...(Array.isArray(door?.other_media) ? door.other_media : [])
          ].filter(url => typeof url === 'string' && url.trim()))];
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
                <img class="door-thumbnail" src="${url}" alt="Installer Media" onerror="this.remove()" onclick="openLightbox('${url}')" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid var(--border); vertical-align:middle; margin-right:4px; cursor:pointer;" />
              `;
            }
          }).join('');

          const installerMediaStripHtml = `
            <div class="booking-installer-uploads" style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.15rem;">
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
              <div class="booking-customer-signature" style="margin-top: 0.6rem; display: flex; flex-direction: column; gap: 0.15rem;">
                <span style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Customer Signature</span>
                <img src="${door.signature}" alt="Customer Signature" style="max-height: 40px; width: auto; align-self: flex-start; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer;" onclick="openChecklistModal(${i})" />
              </div>
            `;
            productCellHtml += signatureHtml;
          } else {
            productCellHtml += `
              <div class="booking-customer-signature" style="display:flex;flex-direction:column;gap:0.15rem;">
                <span style="font-size:0.65rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Customer Signature</span>
                <div class="booking-signature-placeholder">Not signed</div>
              </div>
            `;
          }

          // Door type html
          const doorMaterial = door?.doorMaterial || 'N/A';
          const jambMaterial = door?.jambMaterial || 'N/A';
          let swing = door?.swing || 'N/A';
          if (swing !== 'N/A') {
            swing = swing.replace(/swing/gi, '').trim();
          }
          const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : 'N/A';
          const doorTypeHtml = `
            <div class="booking-door-spec-section">
              <button type="button" class="btn-minimal booking-door-spec-edit-button" id="door-spec-edit-button-${i}" onclick="toggleDoorSpecificationsEdit(${i}, true)" aria-label="Edit door specifications" title="Edit door specifications">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <div class="booking-door-spec-view" id="door-spec-view-${i}">
                <div class="booking-door-spec">
                  <span class="booking-door-spec-label">Door Type</span>
                  <span class="booking-door-spec-value">${escapeHtml(cap(doorMaterial))}</span>
                </div>
                <div class="booking-door-spec">
                  <span class="booking-door-spec-label">Jamb Type</span>
                  <span class="booking-door-spec-value">${escapeHtml(cap(jambMaterial))}</span>
                </div>
                <div class="booking-door-spec">
                  <span class="booking-door-spec-label">Swing</span>
                  <span class="booking-door-spec-value">${escapeHtml(cap(swing))}</span>
                </div>
              </div>
              <div class="booking-door-spec-editor" id="door-spec-edit-${i}" hidden>
                <label class="booking-door-spec-field">
                  <span class="booking-door-spec-label">Door Type</span>
                  <select class="form-input" data-door-spec="doorMaterial">${window.bookingDoorSelectOptions(['wood', 'PVC', 'metal', 'glass', 'gate', 'concrete'], doorMaterial)}</select>
                </label>
                <label class="booking-door-spec-field">
                  <span class="booking-door-spec-label">Jamb Type</span>
                  <select class="form-input" data-door-spec="jambMaterial">${window.bookingDoorSelectOptions(['wood', 'PVC', 'metal', 'glass', 'gate', 'concrete'], jambMaterial)}</select>
                </label>
                <label class="booking-door-spec-field">
                  <span class="booking-door-spec-label">Swing</span>
                  <select class="form-input" data-door-spec="swing">${window.bookingDoorSelectOptions(['Left swing', 'Right swing', 'Sliding', 'Barn Door'], door?.swing || 'N/A')}</select>
                </label>
                <div class="booking-door-spec-actions">
                  <button type="button" class="btn btn-success btn-sm" onclick="saveDoorSpecifications(${i}, this)">Save</button>
                  <button type="button" class="btn btn-outline btn-sm" onclick="toggleDoorSpecificationsEdit(${i}, false)">Cancel</button>
                </div>
              </div>
            </div>
          `;

          // Door photos thumbnails
          const photos = (door?.photos || []).filter(url => (
            typeof url === 'string' && url.trim() && url !== 'null' && url !== 'undefined'
          ));
          let thumbs = '';
          if (photos.length > 0) {
            thumbs = photos.map(url => `
              <img class="door-thumbnail" src="${url}" alt="Door Pic" onerror="this.remove()" onclick="openLightbox('${url}')" style="margin: 0;" />
            `).join('');
          }
          const photosHtml = `
            <div id="door-pics-container-${i}">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; min-width: 110px;">
                <div id="door-pics-list-${i}" style="display: grid; grid-template-columns: repeat(2, 44px); gap: 4px; align-items: center;">${thumbs || `<button type="button" class="booking-door-image-placeholder" onclick="editDoorPics(${i})" aria-label="Add door image" title="Add Door Image"><svg viewBox="0 0 24 24" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>`}</div>
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
                 const roleKey = String(inst.role || '').toLowerCase();
                 const roleLabel = roleKey.includes('assist') ? 'Assistant Installer' : roleKey.includes('lead') ? 'Lead Installer' : roleText ? `${roleText} Installer` : 'Installer';
                 return `<div class="booking-installer-assignment">${installerAvatarMarkup(inst)}<span class="booking-installer-copy"><span class="booking-installer-label">${escapeHtml(roleLabel)}</span><span class="booking-installer-value">${escapeHtml(formatInstallerName(inst.name))}</span></span></div>`;
               }).join('');
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
                const roleText = inst.role ? inst.role.charAt(0).toUpperCase() + inst.role.slice(1) : '';
                const roleKey = String(inst.role || '').toLowerCase();
                const roleLabel = roleKey.includes('assist') ? 'Assistant Installer' : roleKey.includes('lead') ? 'Lead Installer' : roleText ? `${roleText} Installer` : 'Installer';
                return `<div class="booking-installer-assignment">${installerAvatarMarkup(inst)}<span class="booking-installer-copy"><span class="booking-installer-label">${escapeHtml(roleLabel)}</span><span class="booking-installer-value">${escapeHtml(formatInstallerName(inst.name))}</span></span></div>`;
              }).join('');
            }
          } else if (selectedBooking.installer_name) {
            installersHtml = `<div class="booking-installer-assignment">${installerAvatarMarkup({ name: selectedBooking.installer_name })}<span class="booking-installer-copy"><span class="booking-installer-label">Lead Installer</span><span class="booking-installer-value">${escapeHtml(formatInstallerName(selectedBooking.installer_name))}</span></span></div>`;
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
                    <div id="door-inst-text-${i}" class="booking-installer-list">${installersHtml}</div>
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
          hydrateInstallerAvatars(tbody);
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
          const canCompleteUnallocated = !isCancelled
            && !doorHasCompletionAssignment(null, selectedBooking, doorsArr);
          const unallocatedDoneHtml = canCompleteUnallocated ? `
            <button type="button" class="btn btn-sm" id="btn-unallocated-done-${i}" data-sku="${escapeHtml(sku)}" title="Mark done and upload completion proof" style="width:auto;height:28px;padding:0.25rem 0.65rem;background:var(--success);border-color:var(--success);color:#fff;" onclick="openDoorCompletionProofModal(-1, this.dataset.sku)">Done</button>
          ` : '';
          const instCellHtml = isBraceletOrAccessory ? `
            <div id="door-inst-container-general-${i}">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
                <span id="door-inst-text-general-${i}">${escapeHtml(generalInstallersHtml)}</span>
                <div style="display:flex;align-items:center;gap:0.5rem;">
                  ${unallocatedDoneHtml}
                  <button type="button" class="btn-minimal" onclick="editBookingInstallers(${i})" title="Edit Installers">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  </button>
                </div>
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
          renderMapPinLink(mapPinEl, newValue);
        } else if (field === 'notes') {
          const notesDisplay = document.getElementById('det-notes');
          notesDisplay.innerText = newValue || 'No notes';
          notesDisplay.classList.toggle('booking-notes-empty', !String(newValue || '').trim());
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
