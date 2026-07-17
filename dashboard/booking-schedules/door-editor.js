    'use strict';

    // --- Edit Doors Drag-and-Drop Editor State & Functions ---
    let tempEditDoors = [];
    let tempEditProducts = [];
    let tempEditUnassignedProducts = [];

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

      // Find what products are in tempEditProducts (or skus) but not in any door.products
      const allAssignedSkus = new Set();
      tempEditDoors.forEach(d => {
        if (d.products) d.products.forEach(sku => allAssignedSkus.add(sku));
      });

      tempEditUnassignedProducts = [];
      tempEditProducts.forEach(p => {
        if (p.sku !== 'ADD-ON LABOR' && !allAssignedSkus.has(p.sku)) {
          tempEditUnassignedProducts.push(p.sku);
        }
      });
      skus.forEach(sku => {
        if (sku !== 'ADD-ON LABOR' && !allAssignedSkus.has(sku) && !tempEditUnassignedProducts.includes(sku)) {
          tempEditUnassignedProducts.push(sku);
        }
      });

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

    window.deleteProductFromDoor = function(doorIdx, prodIdx) {
      const door = tempEditDoors[doorIdx];
      if (door && door.products) {
        door.products.splice(prodIdx, 1);
        renderEditDoors();
      }
    };

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

      // Calculate excess products inside renderEditDoors()
      const receiptSkuCounts = {};
      if (tempEditProducts && tempEditProducts.length > 0) {
        tempEditProducts.forEach(p => {
          if (!p.cancelled) {
            receiptSkuCounts[p.sku] = (receiptSkuCounts[p.sku] || 0) + (p.qty || 1);
          }
        });
      } else {
        const fallbackSkus = (selectedBooking.product_skus || selectedBooking.sku || '').split(' | ').filter(Boolean);
        const fallbackQtys = (selectedBooking.product_qtys || '').split(' | ').filter(Boolean);
        fallbackSkus.forEach((sku, idx) => {
          if (sku && sku !== 'ADD-ON LABOR') {
            const qty = parseInt(fallbackQtys[idx] || '1', 10) || 1;
            receiptSkuCounts[sku] = (receiptSkuCounts[sku] || 0) + qty;
          }
        });
      }

      const doorSkuCounts = {};
      tempEditDoors.forEach(door => {
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
      for (let d = tempEditDoors.length - 1; d >= 0; d--) {
        const door = tempEditDoors[d];
        const attachedSkus = door.products || [];
        for (let p = attachedSkus.length - 1; p >= 0; p--) {
          const sku = attachedSkus[p];
          if (excessRemaining[sku] > 0) {
            excessProductInstances[`${d}-${p}`] = true;
            excessRemaining[sku]--;
          }
        }
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
            const isExcess = excessProductInstances[`${doorIdx}-${prodIdx}`];
            productsHtml += `
              <div class="drag-product-item" draggable="${hasInst ? 'false' : 'true'}" 
                ondragstart="handleDragStart(event, ${doorIdx}, ${prodIdx})"
                ondragend="handleDragEnd(event)"
                style="${isExcess ? 'border-color: var(--danger);' : ''}">
                <div class="drag-handle">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"></circle><circle cx="9" cy="12" r="2"></circle><circle cx="9" cy="19" r="2"></circle><circle cx="15" cy="5" r="2"></circle><circle cx="15" cy="12" r="2"></circle><circle cx="15" cy="19" r="2"></circle></svg>
                </div>
                <div class="drag-product-text">
                  <strong style="${isExcess ? 'color: var(--danger);' : ''}">${escapeHtml(sku)}</strong> - <span style="${isExcess ? 'color: var(--danger);' : 'color:var(--text-secondary);'}">${escapeHtml(title)}</span>
                  ${isCancelled ? `
                    <span style="color:var(--danger); font-size:0.7rem; font-weight:700; text-transform:uppercase; margin-left:0.35rem;">
                      Cancelled
                    </span>
                  ` : ''}
                </div>
                ${isExcess ? `
                  <button type="button" class="btn-minimal btn-danger" 
                    onclick="event.stopPropagation(); deleteProductFromDoor(${doorIdx}, ${prodIdx})" 
                    title="Remove Excess Product" 
                    style="display:inline-flex; padding: 4px; margin-left: 0.5rem; z-index: 10;">
                    <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                ` : ''}
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

      // Also render the Unassigned Products box
      let unassignedProductsHtml = '';
      if (tempEditUnassignedProducts.length === 0) {
        unassignedProductsHtml = `
          <div style="color: var(--text-muted); font-size: 0.75rem; text-align: center; padding: 1rem; border: 1px dashed var(--border); border-radius: 6px;">
            No unassigned products. Drag products here to unassign them.
          </div>
        `;
      } else {
        tempEditUnassignedProducts.forEach((sku, prodIdx) => {
          const catalogItem = productsCatalog.find(p => p.sku === sku);
          const title = catalogItem ? (catalogItem.name || catalogItem.title) : sku;
          // Is it cancelled?
          const matchingProds = tempEditProducts.filter(p => p.sku === sku);
          const matchedProd = matchingProds[0]; // just grab the first one for unassigned
          const isCancelled = matchedProd ? !!matchedProd.cancelled : false;

          unassignedProductsHtml += `
            <div class="drag-product-item" draggable="true" 
              ondragstart="handleDragStart(event, -1, ${prodIdx})"
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
            </div>
          `;
        });
      }

      const unassignedBoxHtml = `
        <div class="edit-door-box" id="edit-door-box-unassigned"
          style="border-color: var(--border); background: var(--bg-surface); margin-top: 1rem; border-style: dashed;"
          ondragover="handleDragOver(event, -1)"
          ondragleave="handleDragLeave(event, -1)"
          ondrop="handleDrop(event, -1)">
          <div class="edit-door-header" style="border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 0.75rem;">
            <span class="edit-door-title" style="color: var(--text-secondary);">Unassigned Products / Accessories</span>
          </div>
          <div class="edit-door-products-list">
            ${unassignedProductsHtml}
          </div>
        </div>
      `;

      container.insertAdjacentHTML('beforeend', unassignedBoxHtml);
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
      const boxId = doorIdx === -1 ? 'edit-door-box-unassigned' : `edit-door-box-${doorIdx}`;
      const box = document.getElementById(boxId);
      if (box && doorIdx !== dragSourceDoorIdx) {
        box.classList.add('drag-over');
      }
    };

    window.handleDragLeave = function(event, doorIdx) {
      const boxId = doorIdx === -1 ? 'edit-door-box-unassigned' : `edit-door-box-${doorIdx}`;
      const box = document.getElementById(boxId);
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
      const boxId = targetDoorIdx === -1 ? 'edit-door-box-unassigned' : `edit-door-box-${targetDoorIdx}`;
      const box = document.getElementById(boxId);
      if (box) {
        box.classList.remove('drag-over');
      }

      if (dragSourceDoorIdx === null || dragSourceProdIdx === null) return;
      if (dragSourceDoorIdx === targetDoorIdx) return;

      let productSku = '';
      if (dragSourceDoorIdx === -1) {
        productSku = tempEditUnassignedProducts[dragSourceProdIdx];
        tempEditUnassignedProducts.splice(dragSourceProdIdx, 1);
      } else {
        const sourceDoor = tempEditDoors[dragSourceDoorIdx];
        productSku = sourceDoor.products[dragSourceProdIdx];
        sourceDoor.products.splice(dragSourceProdIdx, 1);
      }

      if (targetDoorIdx === -1) {
        tempEditUnassignedProducts.push(productSku);
      } else {
        const targetDoor = tempEditDoors[targetDoorIdx];
        if (!targetDoor.products) targetDoor.products = [];
        targetDoor.products.push(productSku);
      }

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
      if (tempEditProducts.length > 0) {
        originalSkus = tempEditProducts.filter(p => !p.cancelled).map(p => p.sku).filter(sku => sku !== 'ADD-ON LABOR');
      } else if (selectedBooking.sku) {
        originalSkus = selectedBooking.sku.split(' | ').filter(sku => sku !== 'ADD-ON LABOR');
      }

      const allocatedSkus = [];
      tempEditDoors.forEach(d => {
        if (d.products) {
          d.products.forEach(sku => allocatedSkus.push(sku));
        }
      });

      const missingLocks = originalSkus.filter(sku => {
        const skuUpper = sku.toUpperCase();
        return !allocatedSkus.includes(sku) &&
               skuUpper !== 'BACKJOB' &&
               skuUpper !== 'OCULAR' &&
               skuUpper !== 'DAY OFF' &&
               !skuUpper.includes('BRACELET') &&
               !skuUpper.includes('BASEPLATE') &&
               !skuUpper.includes('LABOR') &&
               !skuUpper.includes('KEY');
      });
      if (missingLocks.length > 0) {
        showDragWarning('Incomplete Allocation', `Please allocate all purchased lock units to doors. Unallocated locks: ${missingLocks.join(', ')}`);
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
