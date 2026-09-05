'use strict';

function normalizeWorkflowSku(value) {
  return String(value || '').trim().toUpperCase();
}

function completeInstallerWorkflowRoles(roles, skus) {
  const completed = [...new Set((Array.isArray(roles) ? roles : [])
    .map(role => String(role || '').trim().toLowerCase())
    .filter(Boolean))];
  if (!completed.some(role => role === 'lead' || role === 'service')) return completed;

  const activeSkus = (Array.isArray(skus) ? skus : [])
    .map(normalizeWorkflowSku)
    .filter(sku => sku && sku !== 'ADD-ON LABOR');
  const serviceSkus = new Set((installerServiceCatalog || []).map(product => normalizeWorkflowSku(product?.sku)));
  if (activeSkus.some(sku => !serviceSkus.has(sku)) && !completed.includes('lead')) completed.unshift('lead');
  if (activeSkus.some(sku => serviceSkus.has(sku)) && !completed.includes('service')) completed.push('service');
  return completed;
}

function getSpecialServiceWorkflowSku(booking) {
  const orderNo = normalizeWorkflowSku(booking?.order_no);
  const bookingSkus = getBookingProducts(booking).map(product => normalizeWorkflowSku(product?.sku));
  if (bookingSkus.includes('BACKJOB') || orderNo.startsWith('BJ-')) return 'BACKJOB';
  if (bookingSkus.includes('OCULAR') || orderNo.startsWith('OC-')) return 'OCULAR';
  return '';
}

function applyInstallerWorkflowSetting(type, value) {
  const sets = Array.isArray(value)
    ? { lead: value }
    : (value && typeof value === 'object' && value.sets && typeof value.sets === 'object' ? value.sets : {});
  if (type === 'checklist') bookingChecklistSets = sets;
  else bookingMediaRequirementSets = sets;
}

async function ensureInstallerChecklistLoaded(forceRefresh = false) {
  if (!sb) return false;
  if (installerChecklistLoaded && !forceRefresh) return true;
  if (installerChecklistLoadPromise) return installerChecklistLoadPromise;

  installerChecklistLoadPromise = (async () => {
    const sessionToken = getInstallerSessionToken();
    if (!sessionToken) throw new Error('Installer session is unavailable');

    const { data, error } = await sb
      .rpc('get_installer_workflow_settings', { p_token: sessionToken })
      .maybeSingle();
    if (error) throw error;
    if (!data?.company_id) throw new Error('Installer session expired');

    currentInstaller.company_id = data.company_id;
    localStorage.setItem('bk_active_installer', JSON.stringify(currentInstaller));
    applyInstallerWorkflowSetting('checklist', data.booking_checklist);
    applyInstallerWorkflowSetting('media', data.booking_media_requirements);
    localStorage.setItem(
      `bk_booking_checklist_${currentInstaller.company_id}`,
      JSON.stringify(data.booking_checklist || [])
    );
    localStorage.setItem(
      `bk_booking_media_requirements_${currentInstaller.company_id}`,
      JSON.stringify(data.booking_media_requirements || [])
    );
    installerChecklistLoaded = true;
    return true;
  })().finally(() => {
    installerChecklistLoadPromise = null;
  });

  return installerChecklistLoadPromise;
}

function getBookingProducts(booking) {
  if (Array.isArray(booking?.products)) return booking.products;
  if (typeof booking?.products === 'string') {
    try { return JSON.parse(booking.products); } catch (_) {}
  }
  return String(booking?.product_skus || '').split(' | ').filter(Boolean).map(sku => ({ sku }));
}

function isDoorCancelledForCompletion(booking, door, doorIndex, doors = []) {
  if (door?.cancelled === true || String(door?.status || '').toLowerCase() === 'cancelled') return true;
  const products = getBookingProducts(booking);
  const hardwareProducts = products.filter(product => normalizeWorkflowSku(product?.sku) !== 'ADD-ON LABOR');
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

function getDoorCompletionPolicy(booking, door) {
  let bookingInstallers = [];
  if (Array.isArray(booking?.installers)) bookingInstallers = booking.installers;
  else if (typeof booking?.installers === 'string') {
    try { bookingInstallers = JSON.parse(booking.installers); } catch (_) {}
  }
  const doorInstallers = Array.isArray(door?.installers) && door.installers.length ? door.installers : bookingInstallers;
  let doors = [];
  if (Array.isArray(booking?.doors)) doors = booking.doors;
  else if (typeof booking?.doors === 'string') {
    try { doors = JSON.parse(booking.doors); } catch (_) {}
  }
  const allInstallers = [...bookingInstallers, ...doors.flatMap(item => Array.isArray(item?.installers) ? item.installers : [])];
  const installers = doorInstallers;
  const normalized = installers.map((installer, index) => ({
    ...installer,
    role: String(installer?.role || (index === 0 ? 'lead' : 'assist')).trim().toLowerCase()
  }));
  let allRoles = allInstallers.map((installer, index) => (
    String(installer?.role || (index === 0 ? 'lead' : 'assist')).trim().toLowerCase()
  ));
  const specialServiceSku = getSpecialServiceWorkflowSku(booking);
  if (specialServiceSku && !allRoles.includes('service')) {
    allRoles = allRoles.map(role => role === 'lead' ? 'service' : role);
    normalized.forEach(installer => {
      if (installer.role === 'lead') installer.role = 'service';
    });
  }
  const completionRole = allRoles.includes('lead')
    ? 'lead'
    : (allRoles.includes('service') ? 'service' : null);
  const mine = normalized.find(installer => installer.id === currentInstaller?.id);
  if (!mine || !completionRole) return { allowed: false, key: null, ownerRole: completionRole };
  if (mine.role !== completionRole) return { allowed: false, key: null, ownerRole: completionRole };
  if (completionRole === 'lead') return { allowed: true, key: 'lead', ownerRole: completionRole };

  const serviceSkus = new Set((installerServiceCatalog || []).map(product => normalizeWorkflowSku(product.sku)));
  const attachedSkus = Array.isArray(door?.products) ? door.products.map(normalizeWorkflowSku) : [];
  const bookingSkus = getBookingProducts(booking).filter(product => !product?.cancelled).map(product => normalizeWorkflowSku(product.sku));
  const sku = specialServiceSku || [...attachedSkus, ...bookingSkus].find(value => serviceSkus.has(value));
  return { allowed: true, key: `service:${sku || 'UNSPECIFIED'}`, ownerRole: completionRole };
}

function useInstallerWorkflowForDoor(booking, door) {
  const policy = getDoorCompletionPolicy(booking, door);
  const assignmentChecklist = policy.key && Array.isArray(bookingChecklistSets[policy.key])
    ? bookingChecklistSets[policy.key]
    : null;
  const isServiceAssignment = String(policy.key || '').startsWith('service:');
  bookingChecklist = isServiceAssignment
    ? (assignmentChecklist || [])
    : (assignmentChecklist || (Array.isArray(bookingChecklistSets.lead) ? bookingChecklistSets.lead : []));
  policy.signatureOnly = isServiceAssignment && bookingChecklist.length === 0;
  bookingMediaRequirements = policy.key && Array.isArray(bookingMediaRequirementSets[policy.key]) ? bookingMediaRequirementSets[policy.key] : [];
  return policy;
}

function getInstallerRoleForBooking(b, myId) {
  let isLead = false;
  let isAssist = false;

  // 1. Check doors installers
  let doorsArr = [];
  if (b.doors) {
    if (typeof b.doors === 'string') {
      try { doorsArr = JSON.parse(b.doors); } catch(_) {}
    } else if (Array.isArray(b.doors)) {
      doorsArr = b.doors;
    }
  }

  let foundInDoors = false;
  for (let door of doorsArr) {
    const dInsts = door.installers || [];
    const myIndex = dInsts.findIndex(inst => inst.id === myId);
    if (myIndex !== -1) {
      foundInDoors = true;
      const inst = dInsts[myIndex];
      if (inst.role === 'assist') {
        isAssist = true;
      } else if (inst.role === 'lead') {
        isLead = true;
      } else {
        // Fallback for old data without roles: first installer is lead, rest are assist
        if (myIndex === 0) isLead = true;
        else isAssist = true;
      }
    }
  }

  if (foundInDoors) {
    return isLead ? 'lead' : 'assist';
  }

  // 2. Check booking-level installers
  let bInsts = [];
  if (b.installers) {
    if (typeof b.installers === 'string') {
      try { bInsts = JSON.parse(b.installers); } catch(_) {}
    } else if (Array.isArray(b.installers)) {
      bInsts = b.installers;
    }
  }

  const myBIndex = bInsts.findIndex(inst => inst.id === myId);
  if (myBIndex !== -1) {
    const inst = bInsts[myBIndex];
    if (inst.role === 'assist') return 'assist';
    if (inst.role === 'lead') return 'lead';
    return myBIndex === 0 ? 'lead' : 'assist';
  }

  // 3. Check installer_id mapping
  if (b.installer_id) {
    const ids = b.installer_id.split(' | ');
    const myIdIdx = ids.indexOf(myId);
    if (myIdIdx !== -1) {
      return myIdIdx === 0 ? 'lead' : 'assist';
    }
  }

  return null;
}

function getInstallerAssignedSkus(b, myId) {
  let doorsArr = [];
  if (b.doors) {
    if (typeof b.doors === 'string') {
      try { doorsArr = JSON.parse(b.doors); } catch(_) {}
    } else if (Array.isArray(b.doors)) {
      doorsArr = b.doors;
    }
  }

  let bInsts = [];
  if (b.installers) {
    if (typeof b.installers === 'string') {
      try { bInsts = JSON.parse(b.installers); } catch(_) {}
    } else if (Array.isArray(b.installers)) {
      bInsts = b.installers;
    }
  }
  const isBookingLevelInstaller = bInsts.some(inst => inst && inst.id === myId) || 
                                  (b.installer_id && b.installer_id.split(' | ').includes(myId));

  const assignedSkus = [];

  let productsArr = [];
  if (b.products) {
    if (typeof b.products === 'string') {
      try { productsArr = JSON.parse(b.products); } catch(_) {}
    } else if (Array.isArray(b.products)) {
      productsArr = b.products;
    }
  }
  const skus = (b.product_skus || '').split(' | ');
  const names = (b.product_names || '').split(' | ');
  const rowCount = Math.max(productsArr.length, doorsArr.length, skus.length);

  const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);
  const isSingleDoorGrouping = (doorsArr.length === 1 && productsArr.length > 0);
  const bookingHasDoorLevelInstallers = doorsArr.some(d => d && Array.isArray(d.installers) && d.installers.some(inst => inst && (inst.id || inst.name)));

  for (let i = 0; i < rowCount; i++) {
    const door = doorsArr[i];
    
    let isAssignedToThisDoor = false;
    if (door && Array.isArray(door.installers)) {
      isAssignedToThisDoor = door.installers.some(inst => inst && inst.id === myId);
    } else if (bookingHasDoorLevelInstallers) {
      isAssignedToThisDoor = false;
    } else {
      isAssignedToThisDoor = isBookingLevelInstaller;
    }

    if (isAssignedToThisDoor) {
      if (anyDoorHasAttachedProducts && door) {
        const attachedSkus = door.products || [];
        attachedSkus.forEach(sku => {
          const matchingProds = productsArr.filter(p => p.sku === sku);
          const hasActiveProduct = matchingProds.length === 0 || matchingProds.some(product => !product.cancelled);
          if (hasActiveProduct) {
            assignedSkus.push(sku);
          }
        });
      } else if (isSingleDoorGrouping) {
        productsArr.forEach(p => {
          if (p.sku !== 'ADD-ON LABOR' && !p.cancelled) {
            assignedSkus.push(p.sku);
          }
        });
      } else {
        if (productsArr[i] && !productsArr[i].cancelled) {
          assignedSkus.push(productsArr[i].sku);
        } else if (skus[i]) {
          assignedSkus.push(skus[i]);
        }
      }
    }
  }

  return assignedSkus.join(' | ');
}

function getInstallerAssignedDoorsForBooking(b, myId) {
  const bookingIsDone = ['done', 'completed', 'finished'].includes(String(b.status || '').toLowerCase());
  let doorsArr = [];
  if (b.doors) {
    if (typeof b.doors === 'string') {
      try { doorsArr = JSON.parse(b.doors); } catch(_) {}
    } else if (Array.isArray(b.doors)) {
      doorsArr = b.doors;
    }
  }

  let bInsts = [];
  if (b.installers) {
    if (typeof b.installers === 'string') {
      try { bInsts = JSON.parse(b.installers); } catch(_) {}
    } else if (Array.isArray(b.installers)) {
      bInsts = b.installers;
    }
  }

  const isBookingLevelInstaller = bInsts.some(inst => inst && inst.id === myId) || 
                                  (b.installer_id && b.installer_id.split(' | ').includes(myId));

  const bookingHasDoorLevelInstallers = doorsArr.some(d => d && Array.isArray(d.installers) && d.installers.some(inst => inst && (inst.id || inst.name)));

  const assignedDoors = [];

  // If there are no doors defined, treat the booking itself as one implicit door
  if (doorsArr.length === 0) {
    if (isBookingLevelInstaller) {
      let roles = [];
      const matchedBInsts = bInsts.filter(inst => inst && inst.id === myId);
      if (matchedBInsts.length > 0) {
        matchedBInsts.forEach(inst => {
          const r = inst.role || 'lead';
          if (!roles.includes(r)) roles.push(r);
        });
      } else if (b.installer_id) {
        const ids = b.installer_id.split(' | ');
        const myIdIdx = ids.indexOf(myId);
        if (myIdIdx !== -1) {
          roles.push(myIdIdx === 0 ? 'lead' : 'assist');
        }
      }
      
      if (roles.length === 0) {
        roles.push('lead');
      }
      
      let productsArr = [];
      if (b.products) {
        if (typeof b.products === 'string') {
          try { productsArr = JSON.parse(b.products); } catch(_) {}
        } else if (Array.isArray(b.products)) {
          productsArr = b.products;
        }
      }
      const skus = (b.product_skus || '').split(' | ').filter(Boolean);
      const activeSkus = productsArr.length > 0 
        ? productsArr.filter(p => !p.cancelled && p.sku !== 'ADD-ON LABOR').map(p => p.sku)
        : skus;

      assignedDoors.push({
        doorName: 'Standard Installation',
        completed: bookingIsDone,
        roles: roles,
        skus: activeSkus
      });
    }
    return assignedDoors;
  }

  let productsArr = [];
  if (b.products) {
    if (typeof b.products === 'string') {
      try { productsArr = JSON.parse(b.products); } catch(_) {}
    } else if (Array.isArray(b.products)) {
      productsArr = b.products;
    }
  }
  const skus = (b.product_skus || '').split(' | ');
  const anyDoorHasAttachedProducts = doorsArr.some(d => Array.isArray(d.products) && d.products.length > 0);
  const isSingleDoorGrouping = (doorsArr.length === 1 && productsArr.length > 0);
  doorsArr.forEach((door, index) => {
    if (isDoorCancelledForCompletion(b, door, index, doorsArr)) return;
    let isAssignedToThisDoor = false;
    let roles = [];

    if (door && Array.isArray(door.installers)) {
      const matchedInsts = door.installers.filter(inst => inst && inst.id === myId);
      if (matchedInsts.length > 0) {
        isAssignedToThisDoor = true;
        matchedInsts.forEach(inst => {
          const r = inst.role || 'lead';
          if (!roles.includes(r)) roles.push(r);
        });
      }
    } else if (bookingHasDoorLevelInstallers) {
      isAssignedToThisDoor = false;
    } else {
      isAssignedToThisDoor = isBookingLevelInstaller;
      const matchedBInsts = bInsts.filter(inst => inst && inst.id === myId);
      if (matchedBInsts.length > 0) {
        matchedBInsts.forEach(inst => {
          const r = inst.role || 'lead';
          if (!roles.includes(r)) roles.push(r);
        });
      } else if (b.installer_id) {
        const ids = b.installer_id.split(' | ');
        const myIdIdx = ids.indexOf(myId);
        if (myIdIdx !== -1) {
          roles.push(myIdIdx === 0 ? 'lead' : 'assist');
        }
      }
    }

    if (isAssignedToThisDoor) {
      const doorSkus = [];
      if (anyDoorHasAttachedProducts && door) {
        const attachedSkus = door.products || [];
        attachedSkus.forEach(sku => {
          const matchingProds = productsArr.filter(p => p.sku === sku);
          const hasActiveProduct = matchingProds.length === 0 || matchingProds.some(product => !product.cancelled);
          if (hasActiveProduct) {
            doorSkus.push(sku);
          }
        });
      } else if (isSingleDoorGrouping) {
        productsArr.forEach(p => {
          if (p.sku !== 'ADD-ON LABOR' && !p.cancelled) {
            doorSkus.push(p.sku);
          }
        });
      } else {
        if (productsArr[index] && !productsArr[index].cancelled) {
          doorSkus.push(productsArr[index].sku);
        } else if (skus[index]) {
          doorSkus.push(skus[index]);
        }
      }

      assignedDoors.push({
        doorName: door.name || `Door ${index + 1}`,
        completed: Boolean(door.completed) || bookingIsDone,
        roles: roles,
        skus: doorSkus
      });
    }
  });

  return assignedDoors;
}
