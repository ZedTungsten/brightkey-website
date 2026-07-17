'use strict';

let sb;
let currentTenantId;
let currentCompanyId;

// File Explorer Navigation State
let currentFolderId = null; 
let allResources = [];
let displayedResources = [];
let searchFilter = "";
let folderEditingId = null;
let tagEditingId = null;
let explorerViewMode = localStorage.getItem('bk_resources_view_mode') || 'grid'; // Remember view mode
let selectedResourceIds = []; // Stores IDs of selected resources for bulk operations
let currentMoveModalFolderId = null; // Tracks folder directory state within Move modal
let currentLinkModalFolderId = null; // Tracks folder directory state within Link Folder modal
let currentUserCanEdit = false; // Owner, Director, Sales Manager can delete, move, rename files
let currentSideBySideLeftPage = 1; // Tracks current left page index in side-by-side mode

window.setResourceViewMode = function(mode) {
  explorerViewMode = mode;
  localStorage.setItem('bk_resources_view_mode', mode); // Save preference
  
  const gridBtn = document.getElementById('view-toggle-grid');
  const listBtn = document.getElementById('view-toggle-list');
  const grid = document.getElementById('explorer-grid');

  const headers = document.getElementById('list-headers');

  if (mode === 'grid') {
    grid.classList.remove('list-view-active');
    if (headers) headers.style.display = 'none';
    if (gridBtn) {
      gridBtn.style.background = 'var(--cyan)';
      gridBtn.style.color = '#fff';
    }
    if (listBtn) {
      listBtn.style.background = 'none';
      listBtn.style.color = 'var(--text-muted)';
    }
  } else {
    grid.classList.add('list-view-active');
    if (headers) headers.style.display = 'flex';
    if (gridBtn) {
      gridBtn.style.background = 'none';
      gridBtn.style.color = 'var(--text-muted)';
    }
    if (listBtn) {
      listBtn.style.background = 'var(--cyan)';
      listBtn.style.color = '#fff';
    }
  }

  renderExplorer();
};

document.addEventListener("DOMContentLoaded", async () => {
  // Trigger preference sync on DOM load
  window.setResourceViewMode(explorerViewMode);
  if (window.BKAuth) {
    const authInfo = await window.BKAuth.checkRoleGate(['Sales', 'Operations', 'Owner', 'Admin'], '../admin.html');
    if (!authInfo) return;
    sb = window.BKAuth.sb;
    currentTenantId = authInfo.tenantId;

    // Resolve company_id
    const { data: co, error: coErr } = await sb
      .from('companies')
      .select('id')
      .eq('tenant_id', currentTenantId)
      .limit(1)
      .maybeSingle();

    if (coErr) {
      showToast('Error loading company context: ' + coErr.message, true);
      return;
    }
    currentCompanyId = co?.id || null;

    // Fetch employee level & sales manager configs to resolve file editing permission
    try {
      const user = authInfo.user;
      const [empRes, smRes] = await Promise.all([
        sb.from('employees').select('id, level').eq('email', user.email).limit(1).maybeSingle(),
        sb.from('global_settings').select('value').eq('key', 'sales_managers').eq('company_id', currentCompanyId).maybeSingle()
      ]);

      const emp = empRes.data;
      const salesManagers = (smRes.data?.value && Array.isArray(smRes.data.value.managers)) ? smRes.data.value.managers : [];

      const isOwner = authInfo.role === 'owner';
      const isAdmin = authInfo.role === 'admin';
      const isSalesManager = emp && salesManagers.includes(emp.id);

      currentUserCanEdit = isOwner || isAdmin || isSalesManager;
    } catch (authErr) {
      console.warn('[Permissions Gate] Failed to resolve details:', authErr);
    }

    await loadResources();
  } else {
    showToast('Authentication module missing.', true);
  }
});

async function loadResources() {
  if (!currentCompanyId) return;

  const grid = document.getElementById('explorer-grid');
  grid.innerHTML = `
    <div style="grid-column: 1/-1; display:flex; align-items:center; justify-content:center; padding:3rem 0; gap:0.5rem;">
      <div class="spinner-cyan"></div>
      <span style="font-size:0.85rem; color:var(--text-muted);">Syncing and loading resources...</span>
    </div>
  `;

  try {
    const { data, error } = await sb.from('sales_resources')
      .select('*')
      .eq('company_id', currentCompanyId)
      .order('name', { ascending: true });

    if (error) throw error;
    allResources = data || [];
    renderExplorer();
  } catch (err) {
    console.error(err);
    showToast('Error loading resource index: ' + err.message, true);
  }
}

function renderExplorer() {
  const grid = document.getElementById('explorer-grid');
  const emptyState = document.getElementById('empty-state');
  grid.innerHTML = '';

  // Close open menus on re-render
  document.querySelectorAll('.card-dropdown').forEach(d => d.style.display = 'none');

  // Filter by current folder hierarchy level
  let filtered = allResources.filter(r => r.parent_id === currentFolderId);

  // Apply Search Filter if any
  if (searchFilter) {
    const q = searchFilter.toLowerCase();
    filtered = allResources.filter(r => {
      const nameMatch = r.name.toLowerCase().includes(q);
      const tagMatch = r.tags && r.tags.some(tag => tag.toLowerCase().includes(q));
      return nameMatch || tagMatch;
    });
  }

  displayedResources = filtered;

  // Group folders first, then files
  filtered.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  // Update Breadcrumbs
  renderBreadcrumbs();

  if (filtered.length === 0) {
    emptyState.style.display = 'flex';
    return;
  }
  emptyState.style.display = 'none';

  filtered.forEach(item => {
    const card = document.createElement('div');
    card.className = 'item-card';
    
    let iconHtml = '';
    if (item.type === 'folder') {
      const folderSize = explorerViewMode === 'list' ? 20 : 32;
      iconHtml = `<svg viewBox="0 0 24 24" width="${folderSize}" height="${folderSize}" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    } else {
      // If grid mode and image, load the pre-generated small thumbnail, or fall back to transformation, then original file
      if (explorerViewMode === 'grid' && ['png', 'jpg', 'jpeg'].includes(item.file_type)) {
        let thumbUrl = item.thumbnail_url;
        if (!thumbUrl && item.file_url.includes('storage/v1/object/public/brightkey-assets/')) {
          try {
            const relativePath = item.file_url.substring(item.file_url.indexOf('brightkey-assets/') + 'brightkey-assets/'.length);
            const { data } = sb.storage.from('brightkey-assets').getPublicUrl(relativePath, {
              transform: { width: 200, quality: 60 }
            });
            thumbUrl = data.publicUrl;
          } catch (e) {
            console.warn('[Thumbnail Fallback] Transform failed:', e);
          }
        }
        // If both fail, fall back to default vector icon instead of full resolution file to avoid bandwidth spikes
        const fallbackIcon = `<svg viewBox='0 0 24 24' width='30' height='30' stroke='currentColor' stroke-width='2' fill='none'><rect x='3' y='3' width='18' height='18' rx='2' ry='2'></rect><circle cx='8.5' cy='8.5' r='1.5'></circle><polyline points='21 15 16 10 5 21'></polyline></svg>`;
        iconHtml = `<img src="${thumbUrl || item.file_url}" style="width:100%; height:100%; object-fit:cover; border-radius:6px;" onerror="this.outerHTML = \`${fallbackIcon}\`;" />`;
      } else {
        // File icons depending on file_type
        if (item.file_type === 'pdf') {
          iconHtml = `<svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>`;
        } else if (['png', 'jpg', 'jpeg'].includes(item.file_type)) {
          iconHtml = `<svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
        } else if (item.file_type === 'slide') {
          iconHtml = `<svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="12" rx="2"></rect><path d="M12 15v4M9 21h6"></path></svg>`;
        } else if (item.file_type === 'sheet') {
          iconHtml = `<svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>`;
        } else if (item.file_type === 'music') {
          iconHtml = `<svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none"><path d="M9 18V5l12-2v13"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="18.5" cy="16" r="2.5"></circle></svg>`;
        } else if (item.file_type === 'video') {
          iconHtml = `<svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="2" y1="7" x2="7" y2="7"></line><line x1="2" y1="17" x2="7" y2="17"></line><line x1="17" y1="17" x2="22" y2="17"></line><line x1="17" y1="7" x2="22" y2="7"></line></svg>`;
        } else {
          iconHtml = `<svg viewBox="0 0 24 24" width="30" height="30" stroke="currentColor" stroke-width="2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
        }
      }
    }

    // Auto append lowercase extensions to files in Grid view
    let displayName = item.name;
    if (item.type !== 'folder' && !displayName.toLowerCase().endsWith('.' + String(item.file_type).toLowerCase())) {
      displayName = displayName + '.' + String(item.file_type).toLowerCase();
    }

    // List metadata fields: size, date uploaded only for files
    let metaHtml = '';
    if (explorerViewMode === 'list') {
      if (item.type === 'folder') {
        metaHtml = `<span class="item-meta" style="color:var(--text-muted); font-size:0.75rem;">--</span><span class="item-meta" style="color:var(--text-muted); font-size:0.75rem;">--</span>`;
      } else {
        let sizeStr = '124 KB';
        if (item.file_size) {
          const bytes = item.file_size;
          if (bytes >= 1048576) {
            sizeStr = `${(bytes / 1048576).toFixed(1)} MB`;
          } else {
            sizeStr = `${Math.round(bytes / 1024)} KB`;
          }
        }
        const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : new Date().toLocaleDateString();
        metaHtml = `
          <span class="item-meta" style="color:var(--text-muted); font-size:0.75rem; margin-right:1rem;">${sizeStr}</span>
          <span class="item-meta" style="color:var(--text-muted); font-size:0.75rem;">${dateStr}</span>
        `;
      }
    } else {
      metaHtml = `<span class="item-meta">${item.type === 'folder' ? 'Folder' : String(item.file_type).toUpperCase()}</span>`;
    }

    const isSel = selectedResourceIds.includes(item.id);
    if (isSel) {
      card.classList.add('is-selected');
    }

    // Checkbox wrappers (Only rendered if user has editing permissions)
    const cardCheckboxHtml = currentUserCanEdit ? `
      <div class="card-checkbox-wrapper" onclick="event.stopPropagation();">
        <input type="checkbox" class="card-checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelectResource(event, '${item.id}')" />
      </div>
    ` : '';
    const listCheckboxHtml = currentUserCanEdit ? `
      <div class="list-checkbox-wrapper" onclick="event.stopPropagation();">
        <input type="checkbox" class="list-checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelectResource(event, '${item.id}')" />
      </div>
    ` : '';

    // Action Trigger & Dropdown Menu HTML (Only rendered if user has editing permissions)
    const actionMenuHtml = currentUserCanEdit ? `
      <!-- Actions Menu -->
      <div class="card-actions-trigger" onclick="toggleCardMenu(event, '${item.id}')">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
      </div>
      <div class="card-dropdown" id="menu-${item.id}">
        <div class="card-dropdown-item" onclick="openRenameModal(event, '${item.id}', '${item.name}')">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          Rename
        </div>
        <div class="card-dropdown-item" onclick="openEditTagsModal(event, '${item.id}')">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
          Edit Tags
        </div>
        <div class="card-dropdown-item danger" onclick="deleteResource(event, '${item.id}')">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          Delete
        </div>
      </div>
    ` : '';

    // Determine if folder is a linked folder shortcut
    const isLinkedFolder = item.type === 'folder' && item.file_url && !item.file_url.includes('google.com') && !item.file_url.includes('drive.google.com');
    const isGDriveFolder = item.type === 'folder' && item.file_url && (item.file_url.includes('google.com') || item.file_url.includes('drive.google.com'));

    const shortcutBadgeHtml = isLinkedFolder ? `
      <div class="shortcut-badge" title="Shortcut Link">
        <svg viewBox="0 0 24 24" width="100%" height="100%" stroke="currentColor" stroke-width="3" fill="none">
          <path d="M10 18h5v-5m-5 5l6-6"></path>
        </svg>
      </div>
    ` : '';

    const gdriveFolderBadgeHtml = isGDriveFolder ? `
      <div class="gdrive-badge" title="Google Drive Link">
        <svg viewBox="0 0 87.3 78" width="100%" height="100%">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>
      </div>
    ` : '';

    // Determine if file is from Google Drive
    const isGDrive = item.type !== 'folder' && (item.file_url && (item.file_url.includes('google.com') || item.file_url.includes('drive.google.com') || item.file_url.includes('docs.google.com')));
    const gdriveBadgeHtml = isGDrive ? `
      <div class="gdrive-badge" title="Google Drive Link">
        <svg viewBox="0 0 87.3 78" width="100%" height="100%">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>
      </div>
    ` : '';

    card.innerHTML = `
      ${cardCheckboxHtml}
      ${listCheckboxHtml}
      <div class="item-icon-wrapper">
        ${gdriveBadgeHtml}
        ${gdriveFolderBadgeHtml}
        ${shortcutBadgeHtml}
        ${iconHtml}
      </div>
      <span class="item-name">${escFulfillment(displayName)}</span>
      ${metaHtml}
      ${actionMenuHtml}
    `;

    if (currentUserCanEdit) {
      // Drag and Drop folder-movement features
      card.setAttribute('draggable', 'true');
      card.setAttribute('data-id', item.id);
      card.setAttribute('data-type', item.type);

      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.id);
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });

      // Only folders can receive dropped items
      if (item.type === 'folder') {
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          // Prevent dragging a folder onto itself
          const draggedId = e.dataTransfer.types.includes('text/plain') ? 'valid' : '';
          if (draggedId) {
            card.classList.add('dragover-target');
          }
        });

        card.addEventListener('dragleave', () => {
          card.classList.remove('dragover-target');
        });

        card.addEventListener('drop', async (e) => {
          e.preventDefault();
          card.classList.remove('dragover-target');
          const draggedId = e.dataTransfer.getData('text/plain');
          
          // Safety constraints
          if (!draggedId || draggedId === item.id) return;

          try {
            // Perform moving parent_id update in Supabase
            const { error } = await sb.from('sales_resources')
              .update({ parent_id: item.id, updated_at: new Date().toISOString() })
              .eq('id', draggedId);

            if (error) throw error;
            showToast('Item moved successfully.');
            await loadResources();
          } catch (err) {
            console.error(err);
            showToast('Failed to move item: ' + err.message, true);
          }
        });
      }
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions-trigger') || e.target.closest('.card-dropdown') || e.target.closest('.card-checkbox-wrapper') || e.target.closest('.list-checkbox-wrapper')) {
        return;
      }
      if (item.type === 'folder') {
        if (isGDriveFolder) {
          // Open new tab to browse files directly on Google Drive
          window.open(item.file_url, '_blank');
        } else if (isLinkedFolder) {
          // Link folder shortcut points to another folder ID. Open target folder
          navigateToFolder(item.file_url);
        } else {
          navigateToFolder(item.id);
        }
      } else {
        viewFileResource(item);
      }
    });

    grid.appendChild(card);
  });
}

function toggleCardMenu(e, id) {
  e.stopPropagation();
  const menu = document.getElementById(`menu-${id}`);
  const isVisible = menu.style.display === 'block';
  
  document.querySelectorAll('.card-dropdown').forEach(d => d.style.display = 'none');
  
  if (!isVisible) {
    menu.style.display = 'block';
  }
}

// Close menus when clicking outside
document.addEventListener('click', () => {
  document.querySelectorAll('.card-dropdown').forEach(d => d.style.display = 'none');
});

// ── Breadcrumb Navigation ──
window.navigateToFolder = function(id) {
  currentFolderId = id;
  searchFilter = "";
  document.getElementById('resource-search').value = "";
  clearResourceSelection();
  renderExplorer();
};

function renderBreadcrumbs() {
  const nav = document.getElementById('breadcrumb-nav');
  nav.innerHTML = `<span class="breadcrumb-item" onclick="navigateToFolder(null)">Resources</span>`;

  if (!currentFolderId) return;

  const path = [];
  let tempId = currentFolderId;
  
  while (tempId) {
    const folder = allResources.find(r => r.id === tempId);
    if (folder) {
      path.unshift(folder);
      tempId = folder.parent_id;
    } else {
      break;
    }
  }

  path.forEach(folder => {
    nav.innerHTML += `
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-item" onclick="navigateToFolder('${folder.id}')">${escFulfillment(folder.name)}</span>
    `;
  });
}

// ── Multi-Select Checkboxes Handlers ──
window.toggleSelectResource = function(e, id) {
  if (e.target.checked) {
    if (!selectedResourceIds.includes(id)) {
      selectedResourceIds.push(id);
    }
  } else {
    selectedResourceIds = selectedResourceIds.filter(x => x !== id);
  }
  
  // Update UI highlights
  const cards = document.querySelectorAll('.item-card');
  cards.forEach(c => {
    const cardId = c.getAttribute('data-id');
    if (cardId === id) {
      if (e.target.checked) {
        c.classList.add('is-selected');
      } else {
        c.classList.remove('is-selected');
      }
      // Sync list & grid check states
      const cbGrid = c.querySelector('.card-checkbox');
      const cbList = c.querySelector('.list-checkbox');
      if (cbGrid) cbGrid.checked = e.target.checked;
      if (cbList) cbList.checked = e.target.checked;
    }
  });

  updateSelectionBar();
};

window.updateSelectionBar = function() {
  const bar = document.getElementById('selection-actions-bar');
  const breadcrumbs = document.getElementById('breadcrumb-nav');
  const countLabel = document.getElementById('selection-count-label');

  if (selectedResourceIds.length > 0) {
    if (bar) bar.style.display = 'flex';
    if (breadcrumbs) breadcrumbs.style.display = 'none';
    if (countLabel) countLabel.textContent = `Selected (${selectedResourceIds.length}) files`;
  } else {
    if (bar) bar.style.display = 'none';
    if (breadcrumbs) breadcrumbs.style.display = 'flex';
  }
};

window.clearResourceSelection = function() {
  selectedResourceIds = [];
  document.querySelectorAll('.item-card').forEach(c => {
    c.classList.remove('is-selected');
    const cbGrid = c.querySelector('.card-checkbox');
    const cbList = c.querySelector('.list-checkbox');
    if (cbGrid) cbGrid.checked = false;
    if (cbList) cbList.checked = false;
  });
  updateSelectionBar();
};

window.triggerBulkDelete = async function() {
  if (selectedResourceIds.length === 0) return;
  if (!currentUserCanEdit) {
    showToast('Permission denied: Only Owner, Admin, and Sales Manager can delete resources.', true);
    return;
  }
  const count = selectedResourceIds.length;
  const confirmed = await window.confirmAction(`Are you sure you want to delete (${count}) files?`);
  if (!confirmed) return;

  let successCount = 0;
  let failCount = 0;

  // Disable buttons during deletion
  const barBtns = document.querySelectorAll('#selection-actions-bar button');
  barBtns.forEach(b => b.disabled = true);

  try {
    for (const id of selectedResourceIds) {
      try {
        // 1. Fetch file details to clean up Storage files
        const { data: item } = await sb.from('sales_resources')
          .select('type, file_url, thumbnail_url')
          .eq('id', id)
          .maybeSingle();

        if (item && item.type === 'file') {
          const filesToRemove = [];
          if (item.file_url && item.file_url.includes('storage/v1/object/public/brightkey-assets/')) {
            filesToRemove.push(item.file_url.substring(item.file_url.indexOf('brightkey-assets/') + 'brightkey-assets/'.length));
          }
          if (item.thumbnail_url && item.thumbnail_url.includes('storage/v1/object/public/brightkey-assets/')) {
            filesToRemove.push(item.thumbnail_url.substring(item.thumbnail_url.indexOf('brightkey-assets/') + 'brightkey-assets/'.length));
          }
          if (filesToRemove.length > 0) {
            await sb.storage.from('brightkey-assets').remove(filesToRemove);
          }
        }

        // 2. Delete database entry
        const { error } = await sb.from('sales_resources')
          .delete()
          .eq('id', id);

        if (error) throw error;
        successCount++;
      } catch (itemErr) {
        console.error('[Bulk Delete Item Failed] ID:', id, itemErr);
        failCount++;
      }
    }

    if (successCount > 0) {
      showToast(`Successfully deleted ${successCount} resource(s).`);
    }
    if (failCount > 0) {
      showToast(`Failed to delete ${failCount} resource(s).`, true);
    }

    clearResourceSelection();
    await loadResources();
  } catch (err) {
    console.error(err);
    showToast('Bulk delete failed: ' + err.message, true);
  } finally {
    barBtns.forEach(b => b.disabled = false);
  }
};

window.triggerBulkMove = function() {
  if (selectedResourceIds.length === 0) return;
  currentMoveModalFolderId = null;
  openModal('move-target-modal');
  renderMoveBreadcrumbs();
  loadMoveFolders();
};

async function loadMoveFolders() {
  const container = document.getElementById('move-folders-list');
  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; padding:2rem 0; gap:0.5rem;">
      <div class="spinner-cyan" style="width:18px; height:18px; border-width:2px;"></div>
      <span style="font-size:0.8rem; color:var(--text-muted);">Loading folders...</span>
    </div>
  `;

  try {
    // Query folders in current company context
    const { data, error } = await sb.from('sales_resources')
      .select('id, name, parent_id')
      .eq('company_id', currentCompanyId)
      .eq('type', 'folder')
      .order('name', { ascending: true });

    if (error) throw error;

    // Filter folders for current directory level inside move selector modal
    const folders = data.filter(f => f.parent_id === currentMoveModalFolderId);
    
    // Safety constraint: Prevent moving selected items inside themselves if they are folders
    const cleanFolders = folders.filter(f => !selectedResourceIds.includes(f.id));

    container.innerHTML = '';
    if (cleanFolders.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; font-size:0.8rem; color:var(--text-muted);">
          No subfolders available in this folder.
        </div>
      `;
      return;
    }

    cleanFolders.forEach(folder => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; align-items:center; padding:0.6rem 1rem; border-radius:6px; border:1px solid transparent; cursor:pointer; font-size:0.82rem; font-weight:600; color:var(--text-secondary); transition: background-color 0.1s;';
      row.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" style="margin-right:8px; color:var(--text-muted);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        <span style="flex-grow:1; text-align:left;">${escFulfillment(folder.name)}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" style="color:var(--text-muted);"><polyline points="9 18 15 12 9 6"></polyline></svg>
      `;

      row.addEventListener('click', () => {
        navigateMoveSelectorFolder(folder.id);
      });
      row.addEventListener('mouseenter', () => {
        row.style.background = 'var(--bg-elevated)';
        row.style.borderColor = 'var(--border)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = 'none';
        row.style.borderColor = 'transparent';
      });

      container.appendChild(row);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div style="text-align:center; padding:2rem 1rem; font-size:0.8rem; color:var(--danger);">
        Failed to load directories: ${escFulfillment(err.message)}
      </div>
    `;
  }
}

window.navigateMoveSelectorFolder = function(id) {
  currentMoveModalFolderId = id;
  renderMoveBreadcrumbs();
  loadMoveFolders();
};

function renderMoveBreadcrumbs() {
  const nav = document.getElementById('move-breadcrumb-nav');
  nav.innerHTML = `<span class="breadcrumb-item" onclick="navigateMoveSelectorFolder(null)">Resources</span>`;

  if (!currentMoveModalFolderId) return;

  const path = [];
  let tempId = currentMoveModalFolderId;
  
  while (tempId) {
    const folder = allResources.find(r => r.id === tempId);
    if (folder) {
      path.unshift(folder);
      tempId = folder.parent_id;
    } else {
      break;
    }
  }

  path.forEach(folder => {
    nav.innerHTML += `
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-item" onclick="navigateMoveSelectorFolder('${folder.id}')">${escFulfillment(folder.name)}</span>
    `;
  });
}

window.executeBulkMove = async function() {
  if (selectedResourceIds.length === 0) return;
  if (!currentUserCanEdit) {
    showToast('Permission denied: Only Owner, Admin, and Sales Manager can move resources.', true);
    return;
  }

  const btn = document.getElementById('btn-confirm-move');
  btn.disabled = true;
  btn.textContent = "Moving...";

  try {
    // Perform bulk move parent_id updates in Supabase
    const { error } = await sb.from('sales_resources')
      .update({ parent_id: currentMoveModalFolderId, updated_at: new Date().toISOString() })
      .in('id', selectedResourceIds);

    if (error) throw error;

    showToast(`Successfully moved ${selectedResourceIds.length} item(s).`);
    closeModal('move-target-modal');
    clearResourceSelection();
    await loadResources();
  } catch (err) {
    console.error(err);
    showToast('Bulk move failed: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Move Here";
  }
};

// ── Search Handler ──
window.handleSearch = function(val) {
  searchFilter = String(val).trim();
  renderExplorer();
};

// ── Folder creation ──
// Top-bar Create / Link dropdown toggle
window.toggleCreateLinkDropdown = function(e) {
  e.stopPropagation();
  const dd = document.getElementById('create-link-dropdown');
  const isVisible = dd.style.display === 'flex';
  
  // Close other dropdowns
  document.querySelectorAll('.card-dropdown, .btn-dropdown').forEach(d => d.style.display = 'none');
  
  if (!isVisible) {
    dd.style.display = 'flex';
  }
};

// Close top bar dropdown when clicking outside
document.addEventListener('click', () => {
  const dd = document.getElementById('create-link-dropdown');
  if (dd) dd.style.display = 'none';
});

// ── Link Google Drive Folder ──
window.openLinkGDriveFolderModal = function() {
  if (!currentUserCanEdit) {
    showToast('Permission denied: Only Owner, Admin, and Sales Manager can manage resources.', true);
    return;
  }
  document.getElementById('gdrive-folder-name-input').value = "";
  document.getElementById('gdrive-folder-url-input').value = "";
  openModal('link-gdrive-folder-modal');
  setTimeout(() => {
    document.getElementById('gdrive-folder-name-input').focus();
  }, 50);
};

window.saveGDriveLinkedFolder = async function() {
  if (!currentUserCanEdit) {
    showToast('Permission denied: Only Owner, Admin, and Sales Manager can manage resources.', true);
    return;
  }
  const name = document.getElementById('gdrive-folder-name-input').value.trim();
  const url = document.getElementById('gdrive-folder-url-input').value.trim();
  if (!name || !url) {
    showToast('Please specify folder name and link URL.', true);
    return;
  }

  const btn = document.getElementById('btn-save-gdrive-folder');
  btn.disabled = true;

  try {
    const { error } = await sb.from('sales_resources').insert([{
      company_id: currentCompanyId,
      name: name,
      type: 'folder',
      file_type: 'folder',
      file_url: url, // Store external Google Drive link directly in file_url
      parent_id: currentFolderId
    }]);

    if (error) throw error;
    showToast('Google Drive folder linked successfully.');
    closeModal('link-gdrive-folder-modal');
    await loadResources();
  } catch (err) {
    console.error(err);
    showToast('Failed to link GDrive folder: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
};

// ── Link Folder (Shortcut) ──
window.openLinkFolderModal = function() {
  if (!currentUserCanEdit) {
    showToast('Permission denied: Only Owner, Admin, and Sales Manager can manage resources.', true);
    return;
  }
  currentLinkModalFolderId = null;
  openModal('link-folder-modal');
  renderLinkFolderBreadcrumbs();
  loadLinkFolders();
};

window.navigateLinkSelectorFolder = function(id) {
  currentLinkModalFolderId = id;
  renderLinkFolderBreadcrumbs();
  loadLinkFolders();
};

function renderLinkFolderBreadcrumbs() {
  const nav = document.getElementById('link-folder-breadcrumb-nav');
  nav.innerHTML = `<span class="breadcrumb-item" onclick="navigateLinkSelectorFolder(null)">Resources</span>`;

  if (!currentLinkModalFolderId) return;

  const path = [];
  let tempId = currentLinkModalFolderId;
  
  while (tempId) {
    const folder = allResources.find(r => r.id === tempId);
    if (folder) {
      path.unshift(folder);
      tempId = folder.parent_id;
    } else {
      break;
    }
  }

  path.forEach(folder => {
    nav.innerHTML += `
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-item" onclick="navigateLinkSelectorFolder('${folder.id}')">${escFulfillment(folder.name)}</span>
    `;
  });
}

async function loadLinkFolders() {
  const container = document.getElementById('link-folders-list');
  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:center; padding:2rem 0; gap:0.5rem;">
      <div class="spinner-cyan" style="width:18px; height:18px; border-width:2px;"></div>
      <span style="font-size:0.8rem; color:var(--text-muted);">Loading folders...</span>
    </div>
  `;

  try {
    const { data, error } = await sb.from('sales_resources')
      .select('id, name, parent_id, file_url')
      .eq('company_id', currentCompanyId)
      .eq('type', 'folder')
      .order('name', { ascending: true });

    if (error) throw error;

    // Filter folders for current directory level inside selector modal
    // Filter out folders that are already external links
    const folders = (data || []).filter(f => f.parent_id === currentLinkModalFolderId && (!f.file_url || (!f.file_url.includes('google.com') && !f.file_url.includes('drive.google.com'))));

    container.innerHTML = '';

    if (folders.length === 0) {
      container.innerHTML = `
        <div style="text-align:center; padding:2rem 1rem; color:var(--text-muted); font-size:0.8rem;">
          No folders inside this folder.
        </div>
      `;
      return;
    }

    folders.forEach(f => {
      const item = document.createElement('div');
      item.style = "display:flex; align-items:center; justify-content:space-between; padding:0.6rem 1rem; border-radius:6px; background:var(--bg-surface); border:1px solid var(--border); cursor:pointer; transition:border-color 0.1s;";
      item.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.6rem; font-size:0.8rem; font-weight:700; color:var(--text-primary);">
          <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none" style="color:var(--text-muted);"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span>${escFulfillment(f.name)}</span>
        </div>
        <button class="btn btn-outline" style="height:26px; font-size:0.72rem; padding:0 0.5rem;" onclick="event.stopPropagation(); executeLinkFolderShortcutDirect('${f.id}', '${escFulfillment(f.name).replace(/'/g, "\\'")}')">Link</button>
      `;
      item.onclick = () => navigateLinkSelectorFolder(f.id);
      container.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div style="text-align:center; padding:2rem 1rem; color:var(--danger); font-size:0.8rem;">
        Failed to load folders: ${err.message}
      </div>
    `;
  }
}

window.executeLinkFolderShortcutDirect = async function(targetId, targetName) {
  if (!currentUserCanEdit) {
    showToast('Permission denied: Only Owner, Admin, and Sales Manager can manage resources.', true);
    return;
  }
  
  const btn = document.getElementById('btn-confirm-link-folder');
  btn.disabled = true;

  try {
    const { error } = await sb.from('sales_resources').insert([{
      company_id: currentCompanyId,
      name: targetName,
      type: 'folder',
      file_type: 'folder',
      file_url: targetId, // Save the target folder's ID in file_url to denote shortcut destination
      parent_id: currentFolderId
    }]);

    if (error) throw error;
    showToast('Folder shortcut linked.');
    closeModal('link-folder-modal');
    await loadResources();
  } catch (err) {
    console.error(err);
    showToast('Failed to link folder: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
};

window.executeLinkFolderShortcut = function() {
  // If user clicks the main confirm link button, link the folder currently selected as parent in link folder breadcrumbs
  if (!currentLinkModalFolderId) {
    showToast('Please open the target folder you wish to link first.', true);
    return;
  }
  const folder = allResources.find(r => r.id === currentLinkModalFolderId);
  if (!folder) return;
  executeLinkFolderShortcutDirect(folder.id, folder.name);
};

window.openCreateFolderModal = function() {
  folderEditingId = null;
  document.getElementById('folder-modal-title').textContent = "Create Folder";
  document.getElementById('folder-name-label').textContent = "Folder Name";
  document.getElementById('btn-save-folder').textContent = "Create";
  const input = document.getElementById('folder-name-input');
  input.value = "";
  openModal('create-folder-modal');
  setTimeout(() => {
    input.focus();
  }, 50);
};

window.openRenameModal = function(e, id, currentName) {
  e.stopPropagation();
  folderEditingId = id;
  document.getElementById('folder-modal-title').textContent = "Rename File";
  document.getElementById('folder-name-label').textContent = "";
  document.getElementById('btn-save-folder').textContent = "Rename";
  const input = document.getElementById('folder-name-input');
  input.value = currentName;
  openModal('create-folder-modal');
  setTimeout(() => {
    input.focus();
    input.select();
  }, 50);
};

window.saveFolder = async function() {
  if (!currentUserCanEdit) {
    showToast('Permission denied: Only Owner, Admin, and Sales Manager can manage resources.', true);
    return;
  }
  const name = document.getElementById('folder-name-input').value.trim();
  if (!name) {
    showToast('Please specify a valid name.', true);
    return;
  }

  const btn = document.getElementById('btn-save-folder');
  btn.disabled = true;

  try {
    if (folderEditingId) {
      // Update
      const { error } = await sb.from('sales_resources')
        .update({ name: name, updated_at: new Date().toISOString() })
        .eq('id', folderEditingId);

      if (error) throw error;
      showToast('Resource renamed.');
    } else {
      // Insert Folder
      const { error } = await sb.from('sales_resources').insert([{
        company_id: currentCompanyId,
        name: name,
        type: 'folder',
        file_type: 'folder',
        parent_id: currentFolderId
      }]);

      if (error) throw error;
      showToast('Folder created.');
    }
    
    closeModal('create-folder-modal');
    await loadResources();
  } catch (err) {
    console.error(err);
    showToast('Operation failed: ' + err.message, true);
  } finally {
    btn.disabled = false;
  }
};

// ── File upload / Linking ──
window.openUploadFileModal = function() {
  document.getElementById('file-name-input').value = "";
  document.getElementById('file-uploader').value = "";
  document.getElementById('file-gdrive-url').value = "";
  document.getElementById('file-source-type').value = "upload";
  
  // Reset drop zone state
  const zoneText = document.getElementById('drag-drop-text');
  if (zoneText) zoneText.textContent = "Drag & Drop file here or click to browse";
  const zone = document.getElementById('drop-zone');
  if (zone) zone.classList.remove('dragover');

  toggleFileSourceFields('upload');
  openModal('upload-file-modal');
};

window.handleFileSelect = function(input) {
  const file = input.files[0];
  if (file) {
    document.getElementById('drag-drop-text').textContent = `Selected: ${file.name}`;
    // Auto-fill Resource Name with file name (without extension) if empty
    const nameInput = document.getElementById('file-name-input');
    if (nameInput && !nameInput.value.trim()) {
      const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      nameInput.value = baseName;
    }
  }
};

// Wire up Drag & Drop event listeners after DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-uploader');
  const fullscreenOverlay = document.getElementById('fullscreen-drag-overlay');

  if (!dropZone || !fileInput || !fullscreenOverlay) return;

  // Fullscreen drag detection with precise counter to handle leaving the window cleanly
  let dragCounter = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter++;
      fullscreenOverlay.classList.add('active');
    }
  });

  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    // Check if cursor actually left the page boundaries
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter--;
      if (dragCounter <= 0 || e.clientY <= 0 || e.clientX <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        dragCounter = 0;
        fullscreenOverlay.classList.remove('active');
      }
    }
  });

  // Handle file drop on the screen
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    fullscreenOverlay.classList.remove('active');
    
    if (e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const allowed = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
      
      for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!allowed.includes(ext)) {
          showToast(`Unsupported file type: ${file.name}. Please upload PDF, Doc, PNG or JPG files.`, true);
          continue;
        }
        // Trigger automatic upload with custom loading bar
        autoUploadFile(file);
      }
    }
  });

  // Modal specific drop-zone
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      closeModal('upload-file-modal');
      const allowed = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (allowed.includes(ext)) {
          autoUploadFile(file);
        } else {
          showToast(`Unsupported file type: ${file.name}. Please upload PDF, Doc, PNG or JPG files.`, true);
        }
      }
    }
  }, false);
});

window.toggleFileSourceFields = function(source) {
  const uploadField = document.getElementById('file-upload-field');
  const gdriveField = document.getElementById('file-gdrive-field');
  const btn = document.getElementById('btn-save-file');

  if (source === 'upload') {
    uploadField.style.display = 'block';
    gdriveField.style.display = 'none';
    btn.textContent = "Upload";
  } else {
    uploadField.style.display = 'none';
    gdriveField.style.display = 'block';
    btn.textContent = "Link File";
  }
};

window.saveFile = async function() {
  const source = document.getElementById('file-source-type').value;
  const name = document.getElementById('file-name-input').value.trim();
  const btn = document.getElementById('btn-save-file');

  if (!name) {
    showToast('Please specify a name for this resource.', true);
    return;
  }

  btn.disabled = true;

  try {
    if (source === 'upload') {
      // Handle direct computer upload
      const uploader = document.getElementById('file-uploader');
      if (uploader.files.length === 0) {
        showToast('Please select a file to upload.', true);
        btn.disabled = false;
        return;
      }

      const file = uploader.files[0];
      const ext = file.name.split('.').pop().toLowerCase();
      
      // Validate extensions: .pdf, .doc, .png, .jpg, etc.
      const allowed = ['pdf', 'doc', 'docx', 'png', 'jpg', 'jpeg'];
      if (!allowed.includes(ext)) {
        showToast('Unsupported file type. Please upload a PDF, Doc, PNG or JPG file.', true);
        btn.disabled = false;
        return;
      }

       let fileToUpload = file;
       let uploadName = file.name;
       let fileType = 'doc';

       if (['png', 'jpg', 'jpeg'].includes(ext)) {
         btn.textContent = "Compressing Image...";
         fileToUpload = await compressUploadedImage(file, 1600, 0.8);
         uploadName = fileToUpload.name;
         // Force fileType to 'jpg' since compression pipeline converts PNGs/JPGs to 'image/jpeg'
         fileType = 'jpg';
       } else if (ext === 'pdf') {
         fileType = 'pdf';
       }

       btn.textContent = "Uploading File...";

       // Upload to Supabase Storage Bucket 'brightkey-assets'
       const filePath = `companies/${currentCompanyId}/sales-resources/${Date.now()}_${uploadName}`;
       const { data: uploadData, error: uploadErr } = await sb.storage
         .from('brightkey-assets')
         .upload(filePath, fileToUpload, { cacheControl: '3600', upsert: false });

       if (uploadErr) throw uploadErr;

      // Resolve Public URL
      const { data: { publicUrl } } = sb.storage
        .from('brightkey-assets')
        .getPublicUrl(filePath);

      // Pre-generate client-side thumbnail if file is an image
      let thumbUrl = null;
      if (['png', 'jpg', 'jpeg'].includes(ext)) {
        try {
          const thumbBlob = await generateImageThumbnail(fileToUpload);
          const thumbPath = `companies/${currentCompanyId}/sales-resources/thumbs/${Date.now()}_thumb_${uploadName.replace(/\.[^/.]+$/, "")}.jpg`;
          const { data: tData, error: tErr } = await sb.storage
            .from('brightkey-assets')
            .upload(thumbPath, thumbBlob, { cacheControl: '604800', upsert: false });
          if (!tErr) {
            const { data: { publicUrl: resolvedThumb } } = sb.storage
              .from('brightkey-assets')
              .getPublicUrl(thumbPath);
            thumbUrl = resolvedThumb;
          }
        } catch (thumbErr) {
          console.warn('[Thumbnail Generator] Failed to generate thumbnail:', thumbErr);
        }
      }

      // Save Database Entry
      const { error: dbErr } = await sb.from('sales_resources').insert([{
        company_id: currentCompanyId,
        name: name,
        type: 'file',
        file_type: fileType,
        file_url: publicUrl,
        file_size: fileToUpload.size,
        thumbnail_url: thumbUrl,
        parent_id: currentFolderId
      }]);

      if (dbErr) throw dbErr;
      showToast('File uploaded successfully!');
    } else {
      // Google Drive link
      let url = document.getElementById('file-gdrive-url').value.trim();

      if (!url) {
        showToast('Please provide a Google Drive sharing URL or embed code.', true);
        btn.disabled = false;
        return;
      }

      // If the user pasted a full iframe code, extract the src attribute
      if (url.toLowerCase().startsWith('<iframe')) {
        const srcMatch = url.match(/src=["']([^"']+)["']/i);
        if (srcMatch && srcMatch[1]) {
          url = srcMatch[1];
        }
      }

      // Auto detect Google Drive file type from URL patterns
      let gdriveFileType = 'doc'; // Use distinct variable name
      if (url.includes('/presentation') || url.includes('/slides')) {
        gdriveFileType = 'slide';
      } else if (url.includes('/spreadsheets') || url.includes('/sheets')) {
        gdriveFileType = 'sheet';
      } else if (url.includes('/document') || url.includes('/docs')) {
        gdriveFileType = 'doc';
      }

      const { error: driveDbErr } = await sb.from('sales_resources').insert([{
        company_id: currentCompanyId,
        name: name,
        type: 'file',
        file_type: gdriveFileType,
        file_url: url,
        parent_id: currentFolderId
      }]);

      if (driveDbErr) throw driveDbErr;
      showToast('Google Drive link saved.');
    }

    closeModal('upload-file-modal');
    await loadResources();
  } catch (err) {
    console.error(err);
    showToast('Failed to save resource: ' + err.message, true);
  } finally {
    btn.disabled = false;
    toggleFileSourceFields(source);
  }
};

// Auto Upload dropped files with loading progress bars inside a dedicated Modal
async function autoUploadFile(file) {
  const panel = document.getElementById('upload-progress-panel');
  if (!panel) return;

  // Open the progress modal
  openModal('upload-progress-modal');

  const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  const itemEl = document.createElement('div');
  itemEl.className = 'upload-item';
  itemEl.id = uploadId;
  itemEl.innerHTML = `
    <div class="upload-item-header">
      <span>Uploading: ${escFulfillment(file.name)}</span>
      <span id="pct-${uploadId}">0%</span>
    </div>
    <div class="upload-bar-outer">
      <div class="upload-bar-inner" id="bar-${uploadId}"></div>
    </div>
  `;
  panel.appendChild(itemEl);

  const ext = file.name.split('.').pop().toLowerCase();
  let fileType = 'doc';
  if (['png', 'jpg', 'jpeg'].includes(ext)) {
    fileType = ext;
  } else if (ext === 'pdf') {
    fileType = 'pdf';
  }

  // Helper to animate progress bar simulation (Since Supabase client upload progress is promise-based only)
  let progress = 0;
  const progressInterval = setInterval(() => {
    if (progress < 90) {
      progress += Math.floor(Math.random() * 15) + 5;
      if (progress > 90) progress = 90;
      updateBar(progress);
    }
  }, 180);

  function updateBar(val) {
    const bar = document.getElementById(`bar-${uploadId}`);
    const text = document.getElementById(`pct-${uploadId}`);
    if (bar) bar.style.width = val + '%';
    if (text) text.textContent = val + '%';
  }

  let fileToUpload = file;
  let uploadName = file.name;

  if (['png', 'jpg', 'jpeg'].includes(ext)) {
    fileToUpload = await compressUploadedImage(file, 1600, 0.8);
    uploadName = fileToUpload.name;
    fileType = 'jpg';
  }

  try {
    const filePath = `companies/${currentCompanyId}/sales-resources/${Date.now()}_${uploadName}`;
    const { data: uploadData, error: uploadErr } = await sb.storage
      .from('brightkey-assets')
      .upload(filePath, fileToUpload, { cacheControl: '3600', upsert: false });

    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = sb.storage
      .from('brightkey-assets')
      .getPublicUrl(filePath);

    // Strip file extension to get resource name
    const baseName = uploadName.substring(0, uploadName.lastIndexOf('.')) || uploadName;

    // Pre-generate client-side thumbnail if file is an image
    let thumbUrl = null;
    if (['png', 'jpg', 'jpeg'].includes(ext)) {
      try {
        const thumbBlob = await generateImageThumbnail(fileToUpload);
        const thumbPath = `companies/${currentCompanyId}/sales-resources/thumbs/${Date.now()}_thumb_${uploadName.replace(/\.[^/.]+$/, "")}.jpg`;
        const { data: tData, error: tErr } = await sb.storage
          .from('brightkey-assets')
          .upload(thumbPath, thumbBlob, { cacheControl: '604800', upsert: false });
        if (!tErr) {
          const { data: { publicUrl: resolvedThumb } } = sb.storage
            .from('brightkey-assets')
            .getPublicUrl(thumbPath);
          thumbUrl = resolvedThumb;
        }
      } catch (thumbErr) {
        console.warn('[Thumbnail Generator] Failed to generate thumbnail:', thumbErr);
      }
    }

    const { error: dbErr } = await sb.from('sales_resources').insert([{
      company_id: currentCompanyId,
      name: baseName,
      type: 'file',
      file_type: fileType,
      file_url: publicUrl,
      file_size: fileToUpload.size,
      thumbnail_url: thumbUrl,
      parent_id: currentFolderId
    }]);

    if (dbErr) throw dbErr;

    // Finish progress animation
    clearInterval(progressInterval);
    updateBar(100);

    setTimeout(() => {
      itemEl.remove();
      // Close progress modal if all items complete
      if (panel.querySelectorAll('.upload-item').length === 0) {
        closeModal('upload-progress-modal');
      }
    }, 1000);

    showToast(`Successfully uploaded ${file.name}`);
    await loadResources();
  } catch (err) {
    clearInterval(progressInterval);
    console.error(err);
    itemEl.innerHTML = `
      <div class="upload-item-header" style="color:var(--danger);">
        <span>Failed: ${escFulfillment(file.name)}</span>
        <span>Error</span>
      </div>
      <div style="font-size:0.72rem; color:var(--danger); margin-top:0.25rem;">${escFulfillment(err.message)}</div>
    `;
    setTimeout(() => {
      itemEl.remove();
      if (panel.querySelectorAll('.upload-item').length === 0) {
        closeModal('upload-progress-modal');
      }
    }, 5000);
  }
}

window.deleteResource = async function(e, id) {
  e.stopPropagation();
  if (!currentUserCanEdit) {
    showToast('Permission denied: Only Owner, Admin, and Sales Manager can delete resources.', true);
    return;
  }
  const confirmed = await window.confirmAction('Are you sure you want to delete this resource?');
  if (!confirmed) return;

  try {
    // 1. Fetch file details to clean up Storage files
    const { data: item, error: fetchErr } = await sb.from('sales_resources')
      .select('type, file_url, thumbnail_url')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr) throw fetchErr;

    if (item && item.type === 'file') {
      const filesToRemove = [];
      
      // Original file path resolution
      if (item.file_url && item.file_url.includes('storage/v1/object/public/brightkey-assets/')) {
        const fileRelativePath = item.file_url.substring(item.file_url.indexOf('brightkey-assets/') + 'brightkey-assets/'.length);
        filesToRemove.push(fileRelativePath);
      }

      // Thumbnail path resolution
      if (item.thumbnail_url && item.thumbnail_url.includes('storage/v1/object/public/brightkey-assets/')) {
        const thumbRelativePath = item.thumbnail_url.substring(item.thumbnail_url.indexOf('brightkey-assets/') + 'brightkey-assets/'.length);
        filesToRemove.push(thumbRelativePath);
      }

      // Remove files from Supabase Storage Bucket 'brightkey-assets'
      if (filesToRemove.length > 0) {
        const { error: storageErr } = await sb.storage
          .from('brightkey-assets')
          .remove(filesToRemove);
        if (storageErr) {
          console.warn('[Storage Cleanup] Failed to remove some storage files:', storageErr);
        }
      }
    }

    // 2. Delete database entry
    const { error } = await sb.from('sales_resources')
      .delete()
      .eq('id', id);

    if (error) throw error;
    showToast('Resource deleted.');
    await loadResources();
  } catch (err) {
    console.error(err);
    showToast('Delete failed: ' + err.message, true);
  }
};

// ── Fullscreen View Engine ──
// Global state to track currently viewed item index for next/prev paging
let currentViewerItemIndex = -1;
let viewerItemsList = [];

window.viewFileResource = function(item) {
  const overlay = document.getElementById('file-viewer-overlay');
  const title = document.getElementById('viewer-file-title');
  const body = document.getElementById('viewer-container-body');
  const ctrlBar = document.getElementById('side-by-side-controls');
  const sheetFooter = document.getElementById('sheet-tabs-footer');

  // Build a flat list of files (excluding folders) in current folder/search view for navigation paging
  viewerItemsList = displayedResources.filter(r => r.type !== 'folder');
  currentViewerItemIndex = viewerItemsList.findIndex(r => r.id === item.id);

  // Toggle next/prev buttons visibility
  const prevBtn = document.getElementById('viewer-prev-btn');
  const nextBtn = document.getElementById('viewer-next-btn');
  if (prevBtn && nextBtn) {
    prevBtn.style.display = currentViewerItemIndex > 0 ? 'flex' : 'none';
    nextBtn.style.display = (currentViewerItemIndex >= 0 && currentViewerItemIndex < viewerItemsList.length - 1) ? 'flex' : 'none';
  }

  title.textContent = item.name;
  body.innerHTML = '';
  ctrlBar.style.display = 'none';
  sheetFooter.style.display = 'none';

  let embedUrl = item.file_url;

  // Auto transform Google Drive sharing links to Embed / Preview links
  if (embedUrl.includes('drive.google.com') || embedUrl.includes('docs.google.com')) {
    // Doc, Slides, Sheets embedding transformations
    if (item.file_type === 'doc') {
      embedUrl = transformGDriveDocUrl(embedUrl);
    } else if (item.file_type === 'slide') {
      embedUrl = transformGDriveSlideUrl(embedUrl);
    } else if (item.file_type === 'sheet') {
      embedUrl = transformGDriveSheetUrl(embedUrl);
    }
  }

  overlay.style.display = 'flex';

  if (item.file_type === 'pdf') {
    // Embed PDF preview natively
    body.innerHTML = `<iframe src="${embedUrl}" style="width:100%; height:80vh; min-height:600px; border:none; background:#fff; border-radius:8px;"></iframe>`;
  } else if (['png', 'jpg', 'jpeg'].includes(item.file_type)) {
    // Optimize image rendering speed by requesting low quality (~70% quality, width limit) via Supabase Storage transform parameters if it is an uploaded file
    let displayUrl = embedUrl;
    if (embedUrl.includes('storage/v1/object/public/brightkey-assets/')) {
      try {
        const relativePath = embedUrl.substring(embedUrl.indexOf('brightkey-assets/') + 'brightkey-assets/'.length);
        const { data, error } = sb.storage.from('brightkey-assets').getPublicUrl(relativePath, {
          transform: {
            width: 1200,
            quality: 70
          }
        });
        if (error) throw error;
        displayUrl = data.publicUrl;
      } catch (e) {
        displayUrl = embedUrl;
      }
    }

    // View full height of file naturally by letting it take vertical height and scrolling the .viewer-body wrapper
    body.innerHTML = `<div style="width:100%; height:100%; display:flex; justify-content:center; align-items:center; overflow:hidden;"><img src="${displayUrl}" style="max-width:100%; max-height:calc(100vh - 120px); object-fit:contain; border-radius:6px; box-shadow:0 12px 32px rgba(0,0,0,0.5); display:block;" onerror="this.src='${embedUrl}';" /></div>`;
  } else if (item.file_type === 'doc') {
    // Doc — Render single clean read-only frame aligned with document page dimensions (standard 850px)
    body.innerHTML = `
      <div style="width:100%; max-width:850px; margin: 0 auto; height:90vh; min-height:700px; background:#fff; border-radius:8px; overflow:hidden; border:1px solid var(--border);">
        <iframe src="${embedUrl}" style="width:100%; height:100%; border:none; background:#fff;"></iframe>
      </div>
    `;
  } else if (item.file_type === 'slide') {
    // Slides — Reset page tracks and render side-by-side 2-page preview
    currentSideBySideLeftPage = 1;
    ctrlBar.style.display = 'flex';
    
    // Update header page indicators
    const pageInd = document.getElementById('side-by-side-page-indicator');
    if (pageInd) pageInd.textContent = `Pages 1 - 2`;

    // Apply hash paging parameters to slide iframe views
    const leftUrl = embedUrl.includes('?') ? `${embedUrl}&page=1#page=1#slide=id.p1` : `${embedUrl}?page=1#page=1#slide=id.p1`;
    const rightUrl = embedUrl.includes('?') ? `${embedUrl}&page=2#page=2#slide=id.p2` : `${embedUrl}?page=2#page=2#slide=id.p2`;

    body.innerHTML = `
      <div class="side-by-side-container" style="height:80vh; min-height:600px;">
        <div class="side-page">
          <div class="page-header" id="left-page-header">Page 1</div>
          <iframe id="iframe-view-left" class="page-content-iframe" src="${leftUrl}"></iframe>
        </div>
        <div class="side-page">
          <div class="page-header" id="right-page-header">Page 2</div>
          <iframe id="iframe-view-right" class="page-content-iframe" src="${rightUrl}"></iframe>
        </div>
      </div>
    `;
  } else if (item.file_type === 'sheet') {
    // Spreadsheet — tab views and full scroll support
    sheetFooter.style.display = 'flex';
    renderSheetViewerTabs(embedUrl, sheetFooter, body);
  } else if (item.file_type === 'music') {
    // Music Player View
    body.innerHTML = `
      <div style="background:var(--bg-surface); border:1px solid var(--border); border-radius:12px; padding:2rem; width:min(400px, 100%); text-align:center; display:flex; flex-direction:column; gap:1.25rem; margin-top:5vh;">
        <div style="color:var(--cyan);"><svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M9 18V5l12-2v13"></path><circle cx="6.5" cy="18" r="2.5"></circle><circle cx="18.5" cy="16" r="2.5"></circle></svg></div>
        <div style="font-weight:700; color:var(--text-primary); font-size:0.95rem; word-break:break-all;">${escFulfillment(item.name)}</div>
        <audio controls autoplay src="${embedUrl}" style="width:100%; margin-top:0.5rem;"></audio>
      </div>
    `;
  } else if (item.file_type === 'video') {
    // Video Player View
    body.innerHTML = `
      <video controls autoplay style="max-width:min(800px, 100%); max-height:80vh; border-radius:8px; border:1px solid var(--border); background:#000; margin-top:2vh;" src="${embedUrl}"></video>
    `;
  } else {
    // Generic iframe
    body.innerHTML = `<iframe src="${embedUrl}" style="width:100%; height:80vh; min-height:600px; border:none; background:#fff; border-radius:8px;"></iframe>`;
  }
};

// Paging helper navigation
window.navigateViewerFile = function(direction) {
  if (currentViewerItemIndex === -1 || viewerItemsList.length === 0) return;
  const targetIndex = currentViewerItemIndex + direction;
  if (targetIndex >= 0 && targetIndex < viewerItemsList.length) {
    viewFileResource(viewerItemsList[targetIndex]);
  }
};

window.closeFileViewer = function() {
  const overlay = document.getElementById('file-viewer-overlay');
  const body = document.getElementById('viewer-container-body');
  overlay.style.display = 'none';
  body.innerHTML = ''; // Stop any videos/audios instantly
};

// Google Drive URL transformations
function transformGDriveDocUrl(url) {
  if (url.includes('/pub')) {
    if (!url.includes('embedded=true')) {
      return url.includes('?') ? `${url}&embedded=true` : `${url}?embedded=true`;
    }
    return url;
  }
  if (url.includes('/edit')) {
    return url.replace(/\/edit.*$/, '/preview?rm=minimal');
  }
  if (!url.endsWith('/preview?rm=minimal')) {
    // Strip trailing slash and append /preview?rm=minimal
    return url.replace(/\/+$/, '') + '/preview?rm=minimal';
  }
  return url;
}

function transformGDriveSlideUrl(url) {
  if (url.includes('/pub')) {
    if (!url.includes('embedded=true')) {
      return url.includes('?') ? `${url}&embedded=true` : `${url}?embedded=true`;
    }
    return url;
  }
  if (url.includes('/edit')) {
    return url.replace(/\/edit.*$/, '/preview');
  }
  return url;
}

function transformGDriveSheetUrl(url) {
  if (url.includes('/pub')) {
    if (!url.includes('embedded=true')) {
      return url.includes('?') ? `${url}&embedded=true` : `${url}?embedded=true`;
    }
    return url;
  }
  if (url.includes('/edit')) {
    return url.replace(/\/edit.*$/, '/preview');
  }
  return url;
}

// Google Sheets Tab Renderer
function renderSheetViewerTabs(baseUrl, footer, body) {
  // Mock sheet tabs for demo preview embedding, spreadsheet uses iframe
  body.innerHTML = `
    <div style="width:100%; height:100%; overflow:auto; background:#fff; border-radius:8px;">
      <iframe id="sheet-iframe" src="${baseUrl}" style="width:100%; height:100%; min-width:800px; min-height:600px; border:none;"></iframe>
    </div>
  `;

  footer.innerHTML = `
    <button class="sheet-tab-btn active" onclick="switchSheetTab(this, 1)">Sheet1</button>
    <button class="sheet-tab-btn" onclick="switchSheetTab(this, 2)">Dashboard</button>
    <button class="sheet-tab-btn" onclick="switchSheetTab(this, 3)">Data Ledger</button>
  `;
}

window.switchSheetTab = function(btn, tabIndex) {
  document.querySelectorAll('.sheet-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  showToast(`Switched spreadsheet view to Tab ${tabIndex}`);
};

// Client-side canvas utility to generate a 200px width compressed image thumbnail blob
async function generateImageThumbnail(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const maxW = 200;
        const scale = maxW / img.width;
        canvas.width = maxW;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/jpeg', 0.7); // 70% quality jpeg thumbnail
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Client-side image compressor: scales images down to max 1600px width/height and compresses to 80% JPEG quality
async function compressUploadedImage(file, maxDimension = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
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
          // Convert filename extension to .jpg if compressed
          let newName = file.name;
          const extIdx = newName.lastIndexOf('.');
          if (extIdx !== -1) {
            newName = newName.substring(0, extIdx) + '.jpg';
          } else {
            newName = newName + '.jpg';
          }
          const compressedFile = new File([blob], newName, {
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

// 2-page search & jump logic
window.turnSideBySidePage = function(offset) {
  if (currentViewerItemIndex === -1 || viewerItemsList.length === 0) return;
  const item = viewerItemsList[currentViewerItemIndex];
  let embedUrl = item.file_url;

  // Transform domain URL if needed
  if (embedUrl.includes('drive.google.com') || embedUrl.includes('docs.google.com')) {
    if (item.file_type === 'doc') {
      embedUrl = transformGDriveDocUrl(embedUrl);
    } else if (item.file_type === 'slide') {
      embedUrl = transformGDriveSlideUrl(embedUrl);
    }
  }

  const nextLeft = currentSideBySideLeftPage + offset;
  if (nextLeft < 1) {
    showToast('You are already on the first page.', true);
    return;
  }

  currentSideBySideLeftPage = nextLeft;
  const nextRight = currentSideBySideLeftPage + 1;

  // Update indicators
  const pageInd = document.getElementById('side-by-side-page-indicator');
  if (pageInd) {
    pageInd.textContent = `Pages ${currentSideBySideLeftPage} - ${nextRight}`;
  }

  const headerLeft = document.getElementById('left-page-header');
  const headerRight = document.getElementById('right-page-header');
  if (headerLeft) headerLeft.textContent = `Page ${currentSideBySideLeftPage}`;
  if (headerRight) headerRight.textContent = `Page ${nextRight}`;

  // Update Left View iframe src with new page parameters
  const iframeLeft = document.getElementById('iframe-view-left');
  if (iframeLeft) {
    // Build URL
    iframeLeft.src = embedUrl.includes('?') 
      ? `${embedUrl}&page=${currentSideBySideLeftPage}#page=${currentSideBySideLeftPage}#slide=id.p${currentSideBySideLeftPage}` 
      : `${embedUrl}?page=${currentSideBySideLeftPage}#page=${currentSideBySideLeftPage}#slide=id.p${currentSideBySideLeftPage}`;
  }

  // Update Right View iframe src with new page parameters
  const iframeRight = document.getElementById('iframe-view-right');
  if (iframeRight) {
    iframeRight.src = embedUrl.includes('?') 
      ? `${embedUrl}&page=${nextRight}#page=${nextRight}#slide=id.p${nextRight}` 
      : `${embedUrl}?page=${nextRight}#page=${nextRight}#slide=id.p${nextRight}`;
  }
};

// Helper functions for modal overlay transition conformity
window.openModal = function(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = 'flex';
  modal.offsetHeight; // force reflow
  modal.classList.add('open');
};

window.closeModal = function(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 150);
};

// Utility: custom confirmation overlay component wrapping confirm() to avoid prohibited dialogs
window.confirmAction = function(message) {
  return new Promise((resolve) => {
    let confirmOverlay = document.getElementById('bk-confirm-overlay');
    if (!confirmOverlay) {
      confirmOverlay = document.createElement('div');
      confirmOverlay.id = 'bk-confirm-overlay';
      confirmOverlay.className = 'modal-overlay';
      confirmOverlay.innerHTML = `
        <div class="modal-card" style="width: min(400px, 100%);">
          <div class="modal-header">Confirm Action</div>
          <div id="confirm-msg" style="font-size:0.85rem; color:var(--text-secondary);"></div>
          <div class="modal-footer" style="border:none; padding-top:0;">
            <button type="button" class="btn btn-outline" id="confirm-btn-no">Cancel</button>
            <button type="button" class="btn btn-danger" id="confirm-btn-yes" style="background:var(--danger); border-color:var(--danger); color:#fff;">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(confirmOverlay);
    }

    document.getElementById('confirm-msg').textContent = message;
    
    const btnYes = document.getElementById('confirm-btn-yes');
    const btnNo = document.getElementById('confirm-btn-no');

    const cleanup = (result) => {
      confirmOverlay.classList.remove('open');
      setTimeout(() => {
        confirmOverlay.style.display = 'none';
      }, 150);
      resolve(result);
    };

    btnYes.onclick = () => cleanup(true);
    btnNo.onclick = () => cleanup(false);

    confirmOverlay.style.display = 'flex';
    confirmOverlay.offsetHeight;
    confirmOverlay.classList.add('open');
  });
};

function showToast(message, isError = false) {
  if (window.Toast) {
    window.Toast.show(message, isError ? 'error' : 'success');
  } else {
    alert(message);
  }
}

function escFulfillment(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
}

let modalTags = [];

function getPastelColors() {
  const hue = Math.floor(Math.random() * 360);
  return {
    bg: `hsl(${hue}, 85%, 94%)`,
    text: `hsl(${hue}, 85%, 26%)`,
    border: `hsl(${hue}, 85%, 82%)`
  };
}

function renderInteractiveTags() {
  const container = document.getElementById('tags-pills-list');
  if (!container) return;
  container.innerHTML = '';
  
  modalTags.forEach((tag, idx) => {
    const pill = document.createElement('div');
    pill.className = 'interactive-tag-pill';
    
    const colors = getPastelColors();
    pill.style.backgroundColor = colors.bg;
    pill.style.color = colors.text;
    pill.style.borderColor = colors.border;
    
    pill.innerHTML = `
      <span>${escFulfillment(tag)}</span>
      <span class="interactive-tag-close" onclick="removeInteractiveTag(${idx})">&times;</span>
    `;
    container.appendChild(pill);
  });
}

window.removeInteractiveTag = function(idx) {
  modalTags.splice(idx, 1);
  renderInteractiveTags();
};

window.openEditTagsModal = function(e, id) {
  e.stopPropagation();
  tagEditingId = id;
  const item = allResources.find(r => r.id === id);
  if (!item) return;

  modalTags = [...(item.tags || [])];
  renderInteractiveTags();

  const cardEl = document.querySelector(`[data-id="${id}"]`);
  const modal = document.getElementById('edit-tags-modal');
  const card = modal.querySelector('.modal-card');
  
  modal.style.display = 'flex';
  modal.offsetHeight; // reflow
  modal.classList.add('open');

  if (cardEl) {
    const rect = cardEl.getBoundingClientRect();
    card.style.position = 'absolute';
    card.style.margin = '0';
    card.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    card.style.left = Math.max(10, Math.min(window.innerWidth - 320, rect.left + window.scrollX - 90)) + 'px';
  }
  
  setTimeout(() => {
    const field = document.getElementById('tags-input-field');
    if (field) {
      field.value = '';
      field.focus();
    }
  }, 50);
};

window.triggerBulkEditTags = function(e) {
  if (selectedResourceIds.length === 0) return;
  tagEditingId = null;

  if (selectedResourceIds.length === 1) {
    const item = allResources.find(r => r.id === selectedResourceIds[0]);
    modalTags = [...(item.tags || [])];
  } else {
    modalTags = [];
  }
  
  renderInteractiveTags();

  const btnEl = e.currentTarget;
  const modal = document.getElementById('edit-tags-modal');
  const card = modal.querySelector('.modal-card');
  
  modal.style.display = 'flex';
  modal.offsetHeight; // reflow
  modal.classList.add('open');

  if (btnEl) {
    const rect = btnEl.getBoundingClientRect();
    card.style.position = 'absolute';
    card.style.margin = '0';
    card.style.top = (rect.bottom + window.scrollY + 8) + 'px';
    card.style.left = Math.max(10, Math.min(window.innerWidth - 320, rect.left + window.scrollX)) + 'px';
  }
  
  setTimeout(() => {
    const field = document.getElementById('tags-input-field');
    if (field) {
      field.value = '';
      field.focus();
    }
  }, 50);
};

window.saveTags = async function() {
  if (!tagEditingId && selectedResourceIds.length === 0) return;
  if (!currentUserCanEdit) {
    showToast('Permission denied: Only Owner, Admin, and Sales Manager can manage tags.', true);
    return;
  }

  const inputField = document.getElementById('tags-input-field');
  if (inputField && inputField.value.trim()) {
    const val = inputField.value.trim().replace(/,/g, '');
    if (val && !modalTags.includes(val)) {
      modalTags.push(val);
    }
    inputField.value = '';
  }

  const btn = document.getElementById('btn-save-tags');
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    let query = sb.from('sales_resources')
      .update({ tags: modalTags, updated_at: new Date().toISOString() });

    if (tagEditingId) {
      query = query.eq('id', tagEditingId);
    } else {
      query = query.in('id', selectedResourceIds);
    }

    const { error } = await query;
    if (error) throw error;
    showToast('Tags updated successfully.');
    
    if (tagEditingId) {
      const item = allResources.find(r => r.id === tagEditingId);
      if (item) item.tags = [...modalTags];
    } else {
      selectedResourceIds.forEach(id => {
        const item = allResources.find(r => r.id === id);
        if (item) item.tags = [...modalTags];
      });
    }

    closeModal('edit-tags-modal');
    clearResourceSelection();
    renderExplorer();
  } catch (err) {
    console.error(err);
    showToast('Failed to update tags: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Update";
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const inputField = document.getElementById('tags-input-field');
  if (inputField) {
    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = inputField.value.trim().replace(/,/g, '');
        if (val && !modalTags.includes(val)) {
          modalTags.push(val);
          renderInteractiveTags();
        }
        inputField.value = '';
      }
    });

    inputField.addEventListener('blur', () => {
      const val = inputField.value.trim().replace(/,/g, '');
      if (val && !modalTags.includes(val)) {
        modalTags.push(val);
        renderInteractiveTags();
      }
      inputField.value = '';
    });
  }
});
