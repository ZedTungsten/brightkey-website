'use strict';

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
        completed: b.status === 'done' || b.status === 'completed' || b.status === 'finished',
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
        completed: !!door.completed,
        roles: roles,
        skus: doorSkus
      });
    }
  });

  return assignedDoors;
}
