  const SUPABASE_URL  = 'https://ymjlosnxuhsybkzkoofq.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';
  const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  // ─────────────────────────────────────────────────────
  // Feature definitions per business type
  // ─────────────────────────────────────────────────────
  const FEATURE_DEFS = {
    smart_lock: {
      table: 'smartlock_features',
      label: 'Smart Lock',
      features: [
        { col: 'pin_unlock',          label: 'PIN Unlock' },
        { col: 'rfid_unlock',         label: 'RFID Unlock' },
        { col: 'fingerprint_unlock',  label: 'Fingerprint Unlock' },
        { col: 'face_recognition_3d', label: '3D Facial Recognition' },
        { col: 'palm_vein_unlock',    label: 'Palm Vein Unlock' },
        { col: 'mechanical_key',      label: 'Mechanical Key Unlock' },
        { col: 'emergency_usb',       label: 'Emergency USB Power Port' },
        { col: 'app_control',         label: 'App Control', hint: 'e.g. TTLock, Tuya' },
        { col: 'bluetooth',           label: 'Bluetooth Connect' },
        { col: 'wifi',                label: 'WiFi Connect' },
        { col: 'temporary_pin',       label: 'Temporary PIN' },
        { col: 'doorbell',            label: 'Built-in Doorbell' },
        { col: 'intercom',            label: 'Active Intercom' },
        { col: 'monitoring',          label: 'Active Monitoring' },
        { col: 'dual_cameras',        label: 'Dual Cameras' },
        { col: 'waterproof',          label: 'Waterproof', hint: 'e.g. IP66, IP54' },
        { col: 'fireproof',           label: 'Fireproof' },
        { col: 'scratchproof',        label: 'Scratchproof' },
        { col: 'sunproof',            label: 'Sunproof' },
        { col: 'moisture_proof',      label: 'Moisture Proof' },
        { col: 'splash_proof',        label: 'Splash Proof' },
      ]
    },
    solar_power: {
      table: 'solarpower_features',
      label: 'Solar Power',
      features: [
        { col: 'grid_tie',          label: 'Grid Tie' },
        { col: 'off_grid',          label: 'Off Grid' },
        { col: 'hybrid',            label: 'Hybrid' },
        { col: 'mppt_controller',   label: 'MPPT Controller' },
        { col: 'monitoring_app',    label: 'Monitoring App', hint: 'e.g. Solis, Huawei' },
        { col: 'battery_backup',    label: 'Battery Backup', hint: 'e.g. 10kWh' },
        { col: 'auto_switching',    label: 'Auto Switching' },
        { col: 'weather_resistant', label: 'Weather Resistant', hint: 'e.g. IP65' },
        { col: 'wifi_connect',      label: 'WiFi Connect' },
        { col: 'mobile_alerts',     label: 'Mobile Alerts' },
      ]
    },
    cctv: {
      table: 'cctv_features',
      label: 'CCTV',
      features: [
        { col: 'night_vision',     label: 'Night Vision', hint: 'e.g. 40m, Color' },
        { col: 'resolution',       label: 'Resolution', hint: 'e.g. 1080p, 4K' },
        { col: 'pan_tilt_zoom',    label: 'Pan / Tilt / Zoom' },
        { col: 'motion_detection', label: 'Motion Detection', hint: 'e.g. AI' },
        { col: 'two_way_audio',    label: 'Two-Way Audio' },
        { col: 'cloud_storage',    label: 'Cloud Storage' },
        { col: 'local_storage',    label: 'Local Storage', hint: 'e.g. 256GB' },
        { col: 'weatherproof',     label: 'Weatherproof', hint: 'e.g. IP67' },
        { col: 'wide_angle',       label: 'Wide Angle', hint: 'e.g. 120°' },
        { col: 'ai_detection',     label: 'AI Detection', hint: 'e.g. Face, Vehicle' },
        { col: 'mobile_app',       label: 'Mobile App', hint: 'e.g. Hik-Connect' },
        { col: 'poe_support',      label: 'PoE Support' },
      ]
    },
    fire_extinguisher: {
      table: 'fireextinguisher_features',
      label: 'Fire Extinguisher',
      features: [
        { col: 'type_abc',          label: 'Type ABC' },
        { col: 'type_co2',          label: 'Type CO2' },
        { col: 'type_dry_chemical', label: 'Type Dry Chemical' },
        { col: 'type_foam',         label: 'Type Foam' },
        { col: 'wall_mountable',    label: 'Wall Mountable' },
        { col: 'vehicle_mountable', label: 'Vehicle Mountable' },
        { col: 'refillable',        label: 'Refillable' },
        { col: 'pressure_gauge',    label: 'Pressure Gauge' },
        { col: 'with_bracket',      label: 'With Bracket' },
        { col: 'with_hose',         label: 'With Hose' },
      ]
    }
  };

  // ─────────────────────────────────────────────────────
  // Utility helpers
  // ─────────────────────────────────────────────────────
  const BIZ_LABELS = { smart_lock:'Smart Lock', solar_power:'Solar Power', cctv:'CCTV', fire_extinguisher:'Fire Extinguisher' };

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function fmtPHP(centavos) {
    if (!centavos) return '—';
    return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(centavos/100);
  }
  function parsePrice(val) {
    if (val === null || val === undefined || val === '' || val === '0.00' || val === '0') return 0;
    if (typeof val === 'number' && Number.isInteger(val)) return val;
    const clean = String(val).replace(/[^0-9.]/g,'');
    if (!clean) return 0;
    return Math.round(parseFloat(clean) * 100);
  }
  function fmtPriceInput(centavos) {
    if (!centavos) return '';
    return (centavos / 100).toFixed(2);
  }
  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
  }
  function toast(msg, type='success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => { el.style.animation='fadeOut 0.3s ease forwards'; setTimeout(()=>el.remove(),300); }, 4000);
  }

  // ─────────────────────────────────────────────────────
  // App State
  // ─────────────────────────────────────────────────────
  let allProducts = [];
  let filtered = [];
  let currentSortCol = 'sku';
  let currentSortDir = 'asc';
  let editingId = null;      // null = new product, uuid = editing existing
  let editingFeatureId = null; // id in the features table
  let deleteCallback = null;

  let lastPublishedAt = null;
  let hasUnpublishedChanges = false;
  let currentCompanyId = null;
  let activeTab = 'basic';

  async function checkUnpublishedChanges() {
    try {
      const { data } = await sbClient
        .from('global_settings')
        .select('value')
        .eq('key', 'last_published_at')
        .eq('company_id', currentCompanyId || '')
        .maybeSingle();

      lastPublishedAt = data?.value?.timestamp ? new Date(data.value.timestamp) : null;
      
      if (!lastPublishedAt) {
        hasUnpublishedChanges = true;
      } else {
        hasUnpublishedChanges = allProducts.some(p => {
          const upd = p.updated_at ? new Date(p.updated_at) : (p.created_at ? new Date(p.created_at) : new Date(0));
          return upd > lastPublishedAt;
        });
      }
      updatePublishStateUI();
    } catch (e) {
      console.warn("Failed checking unpublished changes:", e);
    }
  }

  function updatePublishStateUI() {
    const btn = document.getElementById('btn-publish');
    const banner = document.getElementById('unpublished-changes-banner');
    if (!btn) return;
    
    if (hasUnpublishedChanges) {
      btn.disabled = false;
      if (banner) banner.style.display = 'flex';
    } else {
      btn.disabled = true;
      if (banner) banner.style.display = 'none';
    }
  }

  // ─────────────────────────────────────────────────────
  // Fetch & Render Table
  // ─────────────────────────────────────────────────────
  let selectedCategories = new Set();
  let uniqueCategories = [];
  let isCategoryInitialized = false;

  window.selectAllCategories = function(selectActive, event) {
    if (event) event.stopPropagation();
    selectedCategories.clear();
    if (selectActive) {
      uniqueCategories.forEach(cat => selectedCategories.add(cat));
    }
    populateCategoryFilter();
    applyFilters();
  };

  function populateCategoryFilter() {
    const cats = new Set();
    allProducts.forEach(p => {
      cats.add(p.category || '');
    });
    uniqueCategories = Array.from(cats).sort();

    const menu = document.getElementById('category-dropdown-menu');
    if (!menu) return;

    if (!isCategoryInitialized) {
      uniqueCategories.forEach(cat => selectedCategories.add(cat));
      isCategoryInitialized = true;
    }

    const headerHtml = `
      <div style="display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border); padding: 0.25rem 0.5rem 0.5rem; margin-bottom: 0.25rem; justify-content: space-between; align-items: center;">
        <span style="color: var(--cyan-light); cursor: pointer; font-weight: 700; font-size: 0.72rem; text-transform: uppercase;" onclick="selectAllCategories(true, event)">All</span>
        <span style="color: var(--text-muted); cursor: pointer; font-weight: 700; font-size: 0.72rem; text-transform: uppercase;" onclick="selectAllCategories(false, event)">None</span>
      </div>
    `;

    const listHtml = uniqueCategories.map(cat => {
      const displayLabel = cat ? cat.replace(/_/g, ' ') : '(No Category)';
      const checked = selectedCategories.has(cat) ? 'checked' : '';
      return `
        <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem; font-size: 0.82rem; cursor: pointer; color: var(--text-secondary); user-select: none;">
          <input type="checkbox" value="${cat}" ${checked} onchange="handleCategoryCheckboxChange(this)" style="cursor: pointer;" />
          <span style="text-transform: capitalize;">${displayLabel}</span>
        </label>
      `;
    }).join('');

    menu.innerHTML = headerHtml + listHtml;
  }

  window.toggleCategoryDropdown = function(event) {
    event.stopPropagation();
    const menu = document.getElementById('category-dropdown-menu');
    if (!menu) return;
    const isOpen = menu.style.display === 'block';
    menu.style.display = isOpen ? 'none' : 'block';
  };

  window.handleCategoryCheckboxChange = function(cb) {
    const cat = cb.value;
    if (cb.checked) {
      selectedCategories.add(cat);
    } else {
      selectedCategories.delete(cat);
    }
    applyFilters();
  };

  document.addEventListener('click', (e) => {
    const container = document.getElementById('category-dropdown-container');
    const menu = document.getElementById('category-dropdown-menu');
    if (menu && container && !container.contains(e.target)) {
      menu.style.display = 'none';
    }
  });

  async function fetchProducts() {
    const tbody = document.getElementById('products-body');
    tbody.innerHTML = `<tr><td colspan="10" style="padding:2rem;text-align:center;color:var(--text-muted)">Loading…</td></tr>`;
    const { data, error } = await sbClient.from('products').select('*').order('created_at', { ascending: false });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="10" style="padding:2rem;text-align:center;color:var(--danger)">Error: ${esc(error.message)}</td></tr>`;
      return;
    }
    allProducts = data || [];
    updateParentSkuDatalist();
    updateRelatedSkuDatalist();
    updateStats();
    populateCategoryFilter();
    applyFilters();
    await checkUnpublishedChanges();
  }

  function updateStats() {
    document.getElementById('stat-total').textContent = allProducts.length;
    document.getElementById('stat-published').textContent = allProducts.filter(p=>p.status==='published').length;
    document.getElementById('stat-draft').textContent = allProducts.filter(p=>p.status==='draft').length;
    document.getElementById('stat-smart-lock').textContent = allProducts.filter(p=>p.business==='smart_lock').length;
  }

  function updateParentSkuDatalist() {
    const dl = document.getElementById('parent-skus-list');
    if (!dl) return;
    const allSkus = [...new Set(allProducts.filter(p => p.sku).map(p => p.sku))];
    dl.innerHTML = allSkus.map(sku => `<option value="${esc(sku)}"></option>`).join('');
  }

  function updateRelatedSkuDatalist() {
    const input = document.getElementById('f-related');
    const dl = document.getElementById('related-skus-list');
    if (!input || !dl) return;

    const val = input.value;
    const parts = val.split(',');
    const prefixParts = parts.slice(0, -1).map(p => p.trim());
    const lastPart = parts[parts.length - 1].trim();

    const allSkus = [...new Set(allProducts.filter(p => p.sku).map(p => p.sku))];
    const prefixStr = prefixParts.length > 0 ? prefixParts.join(', ') + ', ' : '';

    dl.innerHTML = allSkus
      .filter(sku => sku.toLowerCase().includes(lastPart.toLowerCase()) && !prefixParts.includes(sku))
      .map(sku => `<option value="${esc(prefixStr + sku)}"></option>`)
      .join('');
  }

  function applyFilters() {
    const q = document.getElementById('search-input').value.toLowerCase();
    const biz = document.getElementById('filter-business').value;
    const st = document.getElementById('filter-status').value;

    function getFamilySku(p, list) {
      if (!p.parent_sku) return p.sku;
      // Try exact match first (case-insensitive)
      const exactParent = list.find(x => !x.parent_sku && x.sku && x.sku.toLowerCase() === p.parent_sku.toLowerCase());
      if (exactParent) return exactParent.sku;

      // Prefix/suffix match fallback
      const parent = list.find(x => !x.parent_sku && x.sku && (
        x.sku.toLowerCase().startsWith(p.parent_sku.toLowerCase()) ||
        p.parent_sku.toLowerCase().startsWith(x.sku.toLowerCase())
      ));
      return parent ? parent.sku : p.parent_sku;
    }

    filtered = allProducts.filter(p => {
      if (q && !`${p.sku} ${p.title}`.toLowerCase().includes(q)) return false;
      if (biz && p.business !== biz) return false;
      if (st && p.status !== st) return false;
      
      const cat = p.category || '';
      if (!selectedCategories.has(cat)) return false;
      
      return true;
    });

    // Group children under parents
    const groups = {};
    for (const p of filtered) {
      const family = getFamilySku(p, allProducts);
      if (!groups[family]) {
        groups[family] = [];
      }
      groups[family].push(p);
    }

    // Sort items within each group (parents first)
    for (const family in groups) {
      groups[family].sort((a, b) => {
        const isParentA = !a.parent_sku;
        const isParentB = !b.parent_sku;
        if (isParentA && !isParentB) return -1;
        if (!isParentA && isParentB) return 1;
        return (a.sku || '').localeCompare(b.sku || '');
      });
    }

    // Sort the families themselves
    const familySkus = Object.keys(groups);
    familySkus.sort((fA, fB) => {
      const repA = groups[fA][0];
      const repB = groups[fB][0];

      let valA = repA[currentSortCol];
      let valB = repB[currentSortCol];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      let cmp = 0;
      if (valA < valB) cmp = -1;
      else if (valA > valB) cmp = 1;

      return currentSortDir === 'asc' ? cmp : -cmp;
    });

    // Flatten back into filtered list
    const result = [];
    for (const family of familySkus) {
      result.push(...groups[family]);
    }
    filtered = result;

    renderTable();
  }

  let selectedProductIds = [];
  let isBatchEditing = false;
  let touchedFields = new Set();

  const fieldMapping = {
    'f-title': 'title',
    'f-description': 'description',
    'f-business': 'business',
    'f-category': 'category',
    'f-status': 'status',
    'f-parent-sku': 'parent_sku',
    'f-variant-name': 'variant_name',
    'f-variant-value': 'variant_value',
    'f-image-main': 'image_main',
    'f-image-1': 'image_1',
    'f-image-2': 'image_2',
    'f-image-3': 'image_3',
    'f-image-4': 'image_4',
    'f-video-1': 'video_1',
    'f-video-2': 'video_2',
    'f-user-manual': 'user_manual',
    'f-spec-warranty': 'spec_warranty',
    'f-spec-support': 'spec_support',
    'f-spec-material': 'spec_material',
    'f-spec-voltage': 'spec_voltage',
    'f-spec-dimension': 'spec_dimension',
    'f-display-rating': 'display_rating',
    'f-display-reviews-count': 'display_reviews_count',
    'f-display-bought-month': 'display_bought_month',
    'f-sale-price': 'sale_price',
    'f-discounted-price': 'discounted_price',
    'f-before-price': 'before_price',
    'f-install-price': 'installation_price',
    'f-dealer-price': 'dealer_price',
    'f-override-rating': 'override_rating',
    'f-show-on-ecommerce': 'show_on_ecommerce',
    'f-count-inventory': 'count_inventory',
    'f-show-features': 'show_features',
    'f-show-specs': 'show_specs',
    'f-tags': 'tags',
    'f-related': 'related_skus'
  };

  function updateBatchEditUI() {
    const btn = document.getElementById('btn-batch-edit');
    const countEl = document.getElementById('batch-edit-count');
    if (btn && countEl) {
      const count = selectedProductIds.length;
      countEl.textContent = count;
      btn.disabled = (count === 0);
    }

    const thSelectAll = document.getElementById('th-select-all');
    if (thSelectAll) {
      const visibleIds = filtered.map(p => p.id);
      const selectedVisible = visibleIds.filter(id => selectedProductIds.includes(id));
      if (selectedVisible.length === 0) {
        thSelectAll.checked = false;
        thSelectAll.indeterminate = false;
      } else if (selectedVisible.length === visibleIds.length) {
        thSelectAll.checked = true;
        thSelectAll.indeterminate = false;
      } else {
        thSelectAll.checked = false;
        thSelectAll.indeterminate = true;
      }
    }
  }

  function renderTable() {
    const tbody = document.getElementById('products-body');
    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="12" style="padding:3rem;text-align:center;color:var(--text-muted)">No products found.</td></tr>`;
      return;
    }
    tbody.innerHTML = filtered.map(p => {
      const biz = BIZ_LABELS[p.business] || p.business || '—';
      const bizClass = `biz-${p.business}`;
      const statusClass = p.status === 'published' ? 'status-published' : 'status-draft';
      const isChild = !!p.parent_sku;
      const hasPage = p.show_on_ecommerce !== false;

      let parentExists = true;
      if (p.parent_sku) {
        parentExists = allProducts.some(x => x.sku && x.sku.toLowerCase() === p.parent_sku.toLowerCase());
      }
      const parentWarningHtml = (!parentExists && p.parent_sku)
        ? `<span style="color:var(--danger); font-weight:bold; cursor:help; margin-left:0.25rem; display:inline-flex; vertical-align:middle;" title="Parent SKU '${esc(p.parent_sku)}' does not exist!"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:12px;height:12px;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.6 1.5c-.9.9-1.7 1.4-2.7 2.2V14"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>`
        : '';

      const titleHtml = hasPage 
        ? `<a href="https://www.brightkeysolutions.com/products/${esc(p.slug)}" target="_blank" style="color:var(--cyan);text-decoration:none;font-weight:600;display:inline-flex;align-items:center;gap:0.25rem;">${esc(p.title || '—')} <svg style="width:11px;height:11px;stroke:currentColor;fill:none;stroke-width:2;" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>`
        : `<span style="color:var(--text-primary);font-weight:500;" title="This product has no public page on ecommerce">${esc(p.title || '—')} <span style="font-size:0.7rem;color:var(--text-muted);font-weight:normal;margin-left:0.25rem;">(Hidden)</span></span>`;

      const uploadedDate = p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

      return `<tr class="${isChild ? 'row-child' : ''}">
        <td style="text-align: center; vertical-align: middle;"><input type="checkbox" class="row-checkbox" data-id="${p.id}" style="cursor: pointer;" ${selectedProductIds.includes(p.id) ? 'checked' : ''} /></td>
        <td class="cell-sku"><span class="sku-badge">${esc(p.sku || 'NO-SKU')}</span>${parentWarningHtml}</td>
        <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${titleHtml}</td>
        <td><span class="biz-badge ${bizClass}">${esc(biz)}</span></td>
        <td>${esc(p.category || '—')}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${fmtPHP(p.sale_price)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${p.discounted_price > 0 ? fmtPHP(p.discounted_price) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${p.dealer_price > 0 ? fmtPHP(p.dealer_price) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">${p.installation_price > 0 ? fmtPHP(p.installation_price) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td><span class="status-badge ${statusClass}">${esc(p.status)}</span></td>
        <td><span style="color:var(--text-secondary);font-size:0.8rem;">${uploadedDate}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn-icon btn-edit-product" title="Edit" data-id="${p.id}">
              <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn-icon warning btn-duplicate-product" title="Duplicate" data-id="${p.id}">
              <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
            <button class="btn-icon danger btn-delete-product" title="Delete" data-id="${p.id}" data-title="${esc(p.title || p.sku)}">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('') + `<tr class="table-spacer-row" style="height: auto; border: none; background: transparent !important;"><td colspan="12" style="padding: 0; border: none; background: transparent !important; pointer-events: none;"></td></tr>`;

    updateBatchEditUI();
  }

  function updateDrawerNavigation() {
    const prevBtn = document.getElementById('drawer-prev');
    const nextBtn = document.getElementById('drawer-next');
    const titleEl = document.getElementById('drawer-title');

    if (isBatchEditing) {
      titleEl.textContent = `Batch Edit (${selectedProductIds.length} Products)`;
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      return;
    }

    if (!editingId) {
      titleEl.textContent = 'Add Product';
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      return;
    }

    const currentIndex = filtered.findIndex(x => x.id === editingId);
    const p = allProducts.find(x => x.id === editingId);
    titleEl.textContent = p ? (p.sku || 'Edit Product') : 'Edit Product';

    if (prevBtn) {
      prevBtn.style.display = 'flex';
      prevBtn.disabled = (currentIndex <= 0);
    }
    if (nextBtn) {
      nextBtn.style.display = 'flex';
      nextBtn.disabled = (currentIndex === -1 || currentIndex >= filtered.length - 1);
    }
  }

  function openDrawerAdd() {
    isBatchEditing = false;
    touchedFields.clear();
    clearForm();
    updateDrawerNavigation();
    document.getElementById('drawer-status').textContent = '';
    switchTab('basic');
    document.getElementById('product-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
  }

  async function openDrawerEdit(id) {
    editingId = id;
    isBatchEditing = false;
    touchedFields.clear();
    clearForm();
    
    const p = allProducts.find(x => x.id === id);
    if (p) fillForm(p);
    
    updateDrawerNavigation();
    
    document.getElementById('drawer-status').textContent = 'Loading…';
    document.getElementById('product-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    switchTab(activeTab || 'basic');

    // Load features
    if (p && p.business && FEATURE_DEFS[p.business]) {
      const featureDef = FEATURE_DEFS[p.business];
      const { data: fData } = await sbClient.from(featureDef.table).select('*').eq('product_id', id).maybeSingle();
      if (fData) {
        editingFeatureId = fData.id;
        fillFeatures(p.business, fData);
      }
    }
    document.getElementById('drawer-status').textContent = '';
  }

  async function openDrawerBatchEdit() {
    isBatchEditing = true;
    touchedFields.clear();
    clearForm();

    const titleEl = document.getElementById('drawer-title');
    titleEl.textContent = `Batch Edit (${selectedProductIds.length} Products)`;

    const prevBtn = document.getElementById('drawer-prev');
    const nextBtn = document.getElementById('drawer-next');
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';

    const skuInp = document.getElementById('f-sku');
    const slugInp = document.getElementById('f-slug');
    if (skuInp) {
      skuInp.disabled = true;
      skuInp.placeholder = '(not editable in batch)';
    }
    if (slugInp) {
      slugInp.disabled = true;
      slugInp.placeholder = '(not editable in batch)';
    }

    const selectedProducts = allProducts.filter(p => selectedProductIds.includes(p.id));

    const fields = [
      { id: 'f-title', key: 'title', type: 'text' },
      { id: 'f-description', key: 'description', type: 'textarea' },
      { id: 'f-business', key: 'business', type: 'select' },
      { id: 'f-category', key: 'category', type: 'text' },
      { id: 'f-status', key: 'status', type: 'select' },
      { id: 'f-parent-sku', key: 'parent_sku', type: 'text' },
      { id: 'f-variant-name', key: 'variant_name', type: 'text' },
      { id: 'f-variant-value', key: 'variant_value', type: 'text' },
      { id: 'f-image-main', key: 'image_main', type: 'text' },
      { id: 'f-image-1', key: 'image_1', type: 'text' },
      { id: 'f-image-2', key: 'image_2', type: 'text' },
      { id: 'f-image-3', key: 'image_3', type: 'text' },
      { id: 'f-image-4', key: 'image_4', type: 'text' },
      { id: 'f-video-1', key: 'video_1', type: 'text' },
      { id: 'f-video-2', key: 'video_2', type: 'text' },
      { id: 'f-user-manual', key: 'user_manual', type: 'text' },
      { id: 'f-spec-warranty', key: 'spec_warranty', type: 'text' },
      { id: 'f-spec-support', key: 'spec_support', type: 'text' },
      { id: 'f-spec-material', key: 'spec_material', type: 'text' },
      { id: 'f-spec-voltage', key: 'spec_voltage', type: 'text' },
      { id: 'f-spec-dimension', key: 'spec_dimension', type: 'text' },
      { id: 'f-display-rating', key: 'display_rating', type: 'number' },
      { id: 'f-display-reviews-count', key: 'display_reviews_count', type: 'number' },
      { id: 'f-display-bought-month', key: 'display_bought_month', type: 'text' }
    ];

    fields.forEach(f => {
      const el = document.getElementById(f.id);
      if (!el) return;

      const values = selectedProducts.map(p => p[f.key]);
      const uniqueValues = [...new Set(values)];

      if (uniqueValues.length === 1) {
        const val = uniqueValues[0];
        if (f.type === 'select') {
          el.value = val || '';
        } else {
          el.value = val !== null && val !== undefined ? val : '';
        }
        el.classList.remove('mixed-value');
      } else {
        el.classList.add('mixed-value');
        if (f.type === 'select') {
          let mixedOpt = el.querySelector('option[value="__mixed"]');
          if (!mixedOpt) {
            mixedOpt = document.createElement('option');
            mixedOpt.value = '__mixed';
            mixedOpt.disabled = true;
            mixedOpt.style.fontStyle = 'italic';
            mixedOpt.style.color = 'var(--text-muted)';
            mixedOpt.textContent = '(mixed)';
            el.appendChild(mixedOpt);
          }
          el.value = '__mixed';
        } else {
          el.value = '(mixed)';
        }
      }
    });

    const priceFields = [
      { id: 'f-sale-price', key: 'sale_price' },
      { id: 'f-discounted-price', key: 'discounted_price' },
      { id: 'f-before-price', key: 'before_price' },
      { id: 'f-install-price', key: 'installation_price' },
      { id: 'f-dealer-price', key: 'dealer_price' }
    ];

    priceFields.forEach(f => {
      const el = document.getElementById(f.id);
      if (!el) return;

      const values = selectedProducts.map(p => p[f.key]);
      const uniqueValues = [...new Set(values.map(v => v === null || v === undefined ? '' : String(v)))];

      if (uniqueValues.length === 1) {
        const val = uniqueValues[0];
        el.value = val ? fmtPriceInput(parseFloat(val)) : '';
        el.classList.remove('mixed-value');
      } else {
        el.value = '(mixed)';
        el.classList.add('mixed-value');
      }
    });

    const toggles = [
      { id: 'f-override-rating', key: 'override_rating' },
      { id: 'f-show-on-ecommerce', key: 'show_on_ecommerce' },
      { id: 'f-count-inventory', key: 'count_inventory' },
      { id: 'f-show-features', key: 'show_features' },
      { id: 'f-show-specs', key: 'show_specs' }
    ];

    toggles.forEach(t => {
      const el = document.getElementById(t.id);
      if (!el) return;

      const values = selectedProducts.map(p => p[t.key] !== false);
      const uniqueValues = [...new Set(values)];

      if (uniqueValues.length === 1) {
        el.checked = uniqueValues[0];
        el.indeterminate = false;
      } else {
        el.checked = false;
        el.indeterminate = true;
      }
    });

    const arrayFields = [
      { id: 'f-tags', key: 'tags' },
      { id: 'f-related', key: 'related_skus' }
    ];

    arrayFields.forEach(af => {
      const el = document.getElementById(af.id);
      if (!el) return;

      const stringifiedArrays = selectedProducts.map(p => JSON.stringify((p[af.key] || []).map(s => s.toLowerCase()).sort()));
      const uniqueArrays = [...new Set(stringifiedArrays)];

      if (uniqueArrays.length === 1) {
        const arr = JSON.parse(uniqueArrays[0]);
        el.value = arr.join(', ');
      } else {
        el.value = '(mixed)';
      }
    });

    const promoCheckboxes = document.querySelectorAll('.promo-tag-checkbox');
    promoCheckboxes.forEach(cb => {
      const tagVal = cb.value;
      const counts = selectedProducts.filter(p => (p.promo_tags || []).includes(tagVal)).length;
      if (counts === 0) {
        cb.checked = false;
        cb.indeterminate = false;
      } else if (counts === selectedProducts.length) {
        cb.checked = true;
        cb.indeterminate = false;
      } else {
        cb.checked = false;
        cb.indeterminate = true;
      }
    });

    updateMediaPreviews();
    updatePricePreview();
    updateStatusSelectStyle();

    const bizValues = selectedProducts.map(p => p.business);
    const uniqueBiz = [...new Set(bizValues)];
    if (uniqueBiz.length === 1 && uniqueBiz[0] && FEATURE_DEFS[uniqueBiz[0]]) {
      const business = uniqueBiz[0];
      const featureDef = FEATURE_DEFS[business];
      renderFeaturesTab(business);

      document.getElementById('drawer-status').textContent = 'Loading features…';
      try {
        const { data: featsData } = await sbClient.from(featureDef.table).select('*').in('product_id', selectedProductIds);
        if (featsData && featsData.length > 0) {
          featureDef.features.forEach(f => {
            const vals = selectedProducts.map(p => {
              const fRow = featsData.find(fd => fd.product_id === p.id);
              return fRow ? (fRow[f.col] || '') : '';
            });
            const uniqueVals = [...new Set(vals)];
            const el = document.getElementById(`feat-${f.col}`);
            if (el) {
              if (uniqueVals.length === 1) {
                el.value = uniqueVals[0];
                el.classList.remove('mixed-value');
                updateFeatureRow(f.col, el.value);
              } else {
                el.value = '(mixed)';
                el.classList.add('mixed-value');
                updateFeatureRow(f.col, '(mixed)');
              }
            }
          });
        }
      } catch (err) {
        console.error('Failed to load batch features:', err);
      }
    } else {
      renderFeaturesTab('');
    }

    document.getElementById('drawer-status').textContent = '';
    switchTab('basic');
    document.getElementById('product-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
  }

  function closeDrawer() {
    const ts = document.querySelector('.table-responsive');
    const savedScroll = ts ? ts.scrollTop : 0;
    document.getElementById('product-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
    if (ts) requestAnimationFrame(() => { ts.scrollTop = savedScroll; });
  }

  function updateStatusSelectStyle() {
    const el = document.getElementById('f-status');
    if (!el) return;
    if (el.value === 'draft') {
      el.classList.add('status-select-draft');
      el.classList.remove('status-select-published');
    } else {
      el.classList.add('status-select-published');
      el.classList.remove('status-select-draft');
    }
  }

  // ─────────────────────────────────────────────────────
  // Tabs
  // ─────────────────────────────────────────────────────
  function switchTab(tabName) {
    activeTab = tabName;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
  }

  // ─────────────────────────────────────────────────────
  // Form: Fill / Clear
  // ─────────────────────────────────────────────────────
  function clearForm() {
    ['f-sku','f-slug','f-title','f-description','f-category','f-related','f-tags',
     'f-parent-sku','f-variant-name','f-variant-value',
     'f-image-main','f-image-1','f-image-2','f-image-3','f-image-4','f-video-1','f-video-2',
     'f-spec-warranty','f-spec-support','f-spec-material','f-spec-voltage','f-spec-dimension',
     'f-display-rating', 'f-display-reviews-count', 'f-display-bought-month'
    ].forEach(id => { 
      const el = document.getElementById(id); 
      if(el) {
        el.value = '';
        el.classList.remove('mixed-value');
      }
    });

    const skuInp = document.getElementById('f-sku');
    if (skuInp) {
      skuInp.disabled = false;
      skuInp.placeholder = 'e.g. A04';
    }
    const slugInp = document.getElementById('f-slug');
    if (slugInp) {
      slugInp.disabled = false;
      slugInp.placeholder = 'e.g. a04';
    }

    document.querySelectorAll('#product-drawer input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      cb.indeterminate = false;
    });

    document.getElementById('f-show-on-ecommerce').checked = true;
    document.getElementById('f-count-inventory').checked = true;
    document.getElementById('f-show-features').checked = true;
    document.getElementById('f-show-specs').checked = true;
    document.getElementById('f-business').value = '';
    document.getElementById('f-status').value = 'draft';
    document.getElementById('f-status').classList.remove('mixed-value');
    document.getElementById('f-business').classList.remove('mixed-value');
    
    // Remove temporary mixed option if any
    document.querySelectorAll('option[value="__mixed"]').forEach(opt => opt.remove());

    updateStatusSelectStyle();
    ['f-sale-price','f-discounted-price','f-before-price','f-install-price','f-dealer-price'].forEach(id => {
       const el = document.getElementById(id);
       if (el) {
         el.value = '';
         el.classList.remove('mixed-value');
       }
    });
    const parentInp = document.getElementById('f-parent-sku');
    if (parentInp) {
      parentInp.style.borderColor = '';
      parentInp.style.boxShadow = '';
    }

    updatePricePreview();
    updateMediaPreviews();
    document.getElementById('aplus-blocks-container').innerHTML = '';

    document.getElementById('comp-title-header').value = '';
    document.getElementById('comp-sku-1').value = '';
    document.getElementById('comp-sku-2').value = '';
    document.getElementById('comp-sku-3').value = '';
    const editorEl = document.getElementById('comparison-table-editor');
    if (editorEl) {
      updateComparisonFields(editorEl);
    }
    
  }

  function fillForm(p) {
    const set = (id, val) => { const el = document.getElementById(id); if(el) el.value = val || ''; };
    set('f-sku', p.sku);
    set('f-slug', p.slug);
    set('f-title', p.title);
    set('f-description', p.description);
    set('f-category', p.category);
    set('f-related', (p.related_skus || []).join(', '));
    set('f-tags', (p.tags || []).join(', '));
    set('f-parent-sku', p.parent_sku);
    set('f-variant-name', p.variant_name);
    set('f-variant-value', p.variant_value);
    set('f-image-main', p.image_main);
    set('f-image-1', p.image_1);
    set('f-image-2', p.image_2);
    set('f-image-3', p.image_3);
    set('f-image-4', p.image_4);
    set('f-video-1', p.video_1);
    set('f-video-2', p.video_2);
    set('f-user-manual', p.user_manual);
    set('f-spec-warranty', p.spec_warranty);
    set('f-spec-support', p.spec_support);
    set('f-spec-material', p.spec_material);
    set('f-spec-voltage', p.spec_voltage);
    set('f-spec-dimension', p.spec_dimension);
    set('f-display-rating', p.display_rating);
    set('f-display-reviews-count', p.display_reviews_count);
    set('f-display-bought-month', p.display_bought_month);
    document.getElementById('f-override-rating').checked = !!p.override_rating;
    document.getElementById('f-show-on-ecommerce').checked = p.show_on_ecommerce !== false;
    document.getElementById('f-count-inventory').checked = p.count_inventory !== false;
    document.getElementById('f-show-features').checked = p.show_features !== false;
    document.getElementById('f-show-specs').checked = p.show_specs !== false;
    document.getElementById('f-business').value = p.business || '';
    document.getElementById('f-status').value = p.status || 'draft';
    updateStatusSelectStyle();

    // Highlight parent SKU field if missing
    const parentExists = !p.parent_sku || allProducts.some(x => x.sku && x.sku.toLowerCase() === p.parent_sku.toLowerCase());
    const parentInp = document.getElementById('f-parent-sku');
    if (parentInp) {
      if (!parentExists) {
        parentInp.style.borderColor = 'var(--danger)';
        parentInp.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.15)';
      } else {
        parentInp.style.borderColor = '';
        parentInp.style.boxShadow = '';
      }
    }
    document.getElementById('f-sale-price').value = fmtPriceInput(p.sale_price);
    document.getElementById('f-discounted-price').value = fmtPriceInput(p.discounted_price);
    document.getElementById('f-before-price').value = fmtPriceInput(p.before_price);
    document.getElementById('f-install-price').value = fmtPriceInput(p.installation_price);
    document.getElementById('f-dealer-price').value = fmtPriceInput(p.dealer_price);
    
    // Fill promo tags
    const activeTags = p.promo_tags || [];
    document.querySelectorAll('.promo-tag-checkbox').forEach(cb => {
      cb.checked = activeTags.includes(cb.value);
    });

    updatePricePreview();
    updateMediaPreviews();
    renderFeaturesTab(p.business || '');
    
    // Fill A+ Content
    const aplusContainer = document.getElementById('aplus-blocks-container');
    aplusContainer.innerHTML = '';
    if (p.aplus_content && Array.isArray(p.aplus_content)) {
      p.aplus_content.forEach(block => {
        addAPlusBlock(block.type, block);
      });
    }

    // Fill Comparison Table
    const pCurrent = allProducts.find(x => x.id === editingId);
    const currentSku = pCurrent ? pCurrent.sku : '';
    const skuOptions = `<option value="">(None)</option>` + allProducts
      .filter(prod => prod.sku && prod.sku !== currentSku)
      .map(prod => `<option value="${esc(prod.sku)}">${esc(prod.sku)} — ${esc(prod.title)}</option>`)
      .join('');
    document.getElementById('comp-sku-1').innerHTML = skuOptions;
    document.getElementById('comp-sku-2').innerHTML = skuOptions;
    document.getElementById('comp-sku-3').innerHTML = skuOptions;

    const ct = p.comparison_table || {};
    document.getElementById('comp-title-header').value = ct.title || '';
    const skus = ct.skus || ['', '', ''];
    document.getElementById('comp-sku-1').value = skus[0] || '';
    document.getElementById('comp-sku-2').value = skus[1] || '';
    document.getElementById('comp-sku-3').value = skus[2] || '';
    
    const editor = document.getElementById('comparison-table-editor');
    updateComparisonFields(editor);
    document.getElementById('comp-focus-pos').value = ct.focusPosition || 1;
  }

  function collectForm() {
    const g = id => document.getElementById(id)?.value?.trim() || null;
    const relatedRaw = g('f-related');
    const relatedArr = relatedRaw ? relatedRaw.split(',').map(s=>s.trim()).filter(Boolean) : null;
    const tagsRaw = g('f-tags');
    const tagsArr = tagsRaw ? tagsRaw.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean) : [];

    const slugVal = g('f-slug') || slugify(g('f-title') || '');

    // Collect checked promo tags
    const checkedTags = [];
    document.querySelectorAll('.promo-tag-checkbox').forEach(cb => {
      if (cb.checked) checkedTags.push(cb.value);
    });

    const sku1 = document.getElementById('comp-sku-1')?.value || '';
    const sku2 = document.getElementById('comp-sku-2')?.value || '';
    const sku3 = document.getElementById('comp-sku-3')?.value || '';
    const skus = [sku1, sku2, sku3].filter(Boolean);
    const title = document.getElementById('comp-title-header')?.value?.trim() || '';
    const focusPosition = parseInt(document.getElementById('comp-focus-pos')?.value || '1', 10);
    
    const comparison_table = skus.length > 0 ? {
      title: title,
      skus: skus,
      focusPosition: focusPosition
    } : null;

    return {
      sku:               g('f-sku'),
      slug:              slugVal,
      title:             g('f-title'),
      description:       g('f-description'),
      business:          document.getElementById('f-business').value || null,
      category:          g('f-category'),
      status:            document.getElementById('f-status').value,
      related_skus:      relatedArr,
      parent_sku:        g('f-parent-sku'),
      variant_name:      g('f-variant-name'),
      variant_value:     g('f-variant-value'),
      sale_price:        parsePrice(document.getElementById('f-sale-price').value),
      discounted_price:  parsePrice(document.getElementById('f-discounted-price').value),
      before_price:      parsePrice(document.getElementById('f-before-price').value) || null,
      installation_price:parsePrice(document.getElementById('f-install-price').value) || null,
      dealer_price:      parsePrice(document.getElementById('f-dealer-price').value) || null,
      image_main:        g('f-image-main'),
      image_1:           g('f-image-1'),
      image_2:           g('f-image-2'),
      image_3:           g('f-image-3'),
      image_4:           g('f-image-4'),
      video_1:           g('f-video-1'),
      video_2:           g('f-video-2'),
      user_manual:       g('f-user-manual'),
      spec_warranty:     g('f-spec-warranty'),
      spec_support:      g('f-spec-support'),
      spec_material:     g('f-spec-material'),
      spec_voltage:      g('f-spec-voltage'),
      spec_dimension:    g('f-spec-dimension'),
      display_rating:    g('f-display-rating') ? parseFloat(g('f-display-rating')) : null,
      display_reviews_count: g('f-display-reviews-count') ? parseInt(g('f-display-reviews-count'), 10) : null,
      display_bought_month: g('f-display-bought-month'),
      override_rating:    document.getElementById('f-override-rating').checked,
      show_on_ecommerce:  document.getElementById('f-show-on-ecommerce').checked,
      count_inventory:    document.getElementById('f-count-inventory').checked,
      show_features:      document.getElementById('f-show-features').checked,
      show_specs:         document.getElementById('f-show-specs').checked,
      aplus_content:     collectAPlusContent(),
      comparison_table:  comparison_table,
      promo_tags:        checkedTags.length > 0 ? checkedTags : null,
      tags:              tagsArr,
      company_id:        currentCompanyId
    };
  }

  function collectFeatures(business) {
    const def = FEATURE_DEFS[business];
    if (!def) return null;
    const result = {};
    def.features.forEach(f => {
      const el = document.getElementById(`feat-${f.col}`);
      result[f.col] = el ? (el.value.trim() || null) : null;
    });
    return result;
  }

  // ─────────────────────────────────────────────────────
  function updatePricePreview() {
    const mainEl = document.getElementById('preview-main');
    if (!mainEl) return;

    const sale    = parsePrice(document.getElementById('f-sale-price').value);
    const disc    = parsePrice(document.getElementById('f-discounted-price').value);
    const before  = parsePrice(document.getElementById('f-before-price').value);
    const install = parsePrice(document.getElementById('f-install-price').value);

    const displayPrice = (disc > 0) ? disc : sale;
    mainEl.textContent = displayPrice ? fmtPHP(displayPrice) : '₱0.00';

    const beforeEl = document.getElementById('preview-before');
    if (beforeEl) {
      if (before > 0) { beforeEl.textContent = fmtPHP(before); beforeEl.style.display='block'; }
      else beforeEl.style.display='none';
    }

    const promoEl = document.getElementById('preview-promo');
    if (promoEl) {
      promoEl.style.display = disc > 0 ? 'block' : 'none';
    }

    const installEl = document.getElementById('preview-install');
    if (installEl) {
      installEl.textContent = install > 0 ? `+ Installation: ${fmtPHP(install)}` : '';
    }
  }

  // ─────────────────────────────────────────────────────
  // Media Previews
  // ─────────────────────────────────────────────────────
  function updateMediaPreviews() {
    ['image-main','image-1','image-2','image-3','image-4'].forEach(key => {
      const url = document.getElementById(`f-${key}`)?.value?.trim();
      const prev = document.getElementById(`prev-${key}`);
      if (!prev) return;
      prev.innerHTML = url
        ? `<img src="${esc(url)}" onerror="this.parentElement.innerHTML='<span class=media-preview-empty>Invalid URL</span>'" />`
        : `<span class="media-preview-empty">No image</span>`;
    });
  }

  // ─────────────────────────────────────────────────────
  // Features Tab
  // ─────────────────────────────────────────────────────
  function renderFeaturesTab(business) {
    const hint = document.getElementById('features-hint');
    const content = document.getElementById('features-content');
    const grid = document.getElementById('features-grid');

    if (!business || !FEATURE_DEFS[business]) {
      hint.style.display = 'block';
      content.style.display = 'none';
      return;
    }
    hint.style.display = 'none';
    content.style.display = 'block';

    const def = FEATURE_DEFS[business];
    grid.innerHTML = def.features.map(f => `
      <div class="feature-row" id="feat-row-${f.col}">
        <span class="feature-name">${esc(f.label)}${f.hint ? `<br><small style="font-weight:400;color:var(--text-muted)">${esc(f.hint)}</small>` : ''}</span>
        <input type="text" class="feature-input" id="feat-${f.col}" placeholder="x / ${esc(f.hint || 'specific value')}" oninput="onFeatureInput('${f.col}')" />
        <button class="btn-mark-x" id="feat-mark-${f.col}" onclick="markFeatureX('${f.col}')" title="Mark as x"><svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:inline-block;vertical-align:-0.15em;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;margin-right:0.2rem;"><polyline points="20 6 9 17 4 12"/></svg>x</button>
      </div>
    `).join('');
  }

  function fillFeatures(business, data) {
    const def = FEATURE_DEFS[business];
    if (!def) return;
    def.features.forEach(f => {
      const el = document.getElementById(`feat-${f.col}`);
      if (el) {
        el.value = data[f.col] || '';
        updateFeatureRow(f.col, el.value);
      }
    });
  }

  function onFeatureInput(col) {
    const el = document.getElementById(`feat-${col}`);
    updateFeatureRow(col, el?.value || '');
  }

  function updateFeatureRow(col, val) {
    const row = document.getElementById(`feat-row-${col}`);
    const inp = document.getElementById(`feat-${col}`);
    const mark = document.getElementById(`feat-mark-${col}`);
    if (val) {
      row?.classList.add('has-value');
      inp?.classList.add('has-val');
      if (mark) mark.classList.add('marked');
    } else {
      row?.classList.remove('has-value');
      inp?.classList.remove('has-val');
      if (mark) mark.classList.remove('marked');
    }
  }

  function markFeatureX(col) {
    const el = document.getElementById(`feat-${col}`);
    if (!el) return;
    el.value = el.value === 'x' ? '' : 'x';
    updateFeatureRow(col, el.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ─────────────────────────────────────────────────────
  // A+ Content Builder
  // ─────────────────────────────────────────────────────
  
  window.updateComparisonFields = (blockEl) => {
    const sku1 = blockEl.querySelector('.comparison-sku-1').value;
    const sku2 = blockEl.querySelector('.comparison-sku-2').value;
    const sku3 = blockEl.querySelector('.comparison-sku-3').value;

    let enabledSkusCount = 0;
    if (sku1) enabledSkusCount++;
    if (sku2) enabledSkusCount++;
    if (sku3) enabledSkusCount++;

    const focusSelect = blockEl.querySelector('.comparison-focus-pos');
    const prevVal = focusSelect.value;
    focusSelect.innerHTML = '';
    const totalPositions = enabledSkusCount + 1;
    const suffixes = ['st', 'nd', 'rd', 'th'];
    for (let i = 1; i <= totalPositions; i++) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${i}${suffixes[i-1] || 'th'}`;
      focusSelect.appendChild(opt);
    }
    if (parseInt(prevVal, 10) <= totalPositions) {
      focusSelect.value = prevVal;
    } else {
      focusSelect.value = '1';
    }
  };

  function getAPlusTemplate(type, data = {}) {
    const escVal = v => v ? esc(String(v)) : '';
    let inner = '';
    
    if (type === 'text_image' || type === 'image_text') {
      inner = `
        <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
          <label class="form-label">Header</label>
          <input type="text" class="form-input aplus-header" value="${escVal(data.header)}" placeholder="Section Header" />
        </div>
        <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
          <label class="form-label">Body Text</label>
          <textarea class="form-input aplus-body" rows="3" placeholder="Description...">${escVal(data.body)}</textarea>
        </div>
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          <label class="form-label">Media URL (Image or MP4)</label>
          <input type="url" class="form-input aplus-media" value="${escVal(data.mediaUrl)}" placeholder="https://..." />
        </div>
      `;
    } else if (type === 'text_center') {
      inner = `
        <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
          <label class="form-label">Header</label>
          <input type="text" class="form-input aplus-header" value="${escVal(data.header)}" placeholder="Centered Header" />
        </div>
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          <label class="form-label">Body Text</label>
          <textarea class="form-input aplus-body" rows="4" placeholder="Centered description...">${escVal(data.body)}</textarea>
        </div>
      `;
    } else if (type === 'image_full') {
      inner = `
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          <label class="form-label">Full Width Media URL</label>
          <input type="url" class="form-input aplus-media" value="${escVal(data.mediaUrl)}" placeholder="https://..." />
        </div>
      `;
    } else if (type === 'grid_2x2') {
      inner = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
          <div>
            <label class="form-label">Image 1 (Top Left)</label>
            <input type="url" class="form-input aplus-img1" value="${escVal(data.img1)}" />
          </div>
          <div>
            <label class="form-label">Image 2 (Top Right)</label>
            <input type="url" class="form-input aplus-img2" value="${escVal(data.img2)}" />
          </div>
          <div>
            <label class="form-label">Image 3 (Bottom Left)</label>
            <input type="url" class="form-input aplus-img3" value="${escVal(data.img3)}" />
          </div>
          <div>
            <label class="form-label">Image 4 (Bottom Right)</label>
            <input type="url" class="form-input aplus-img4" value="${escVal(data.img4)}" />
          </div>
        </div>
      `;
    } else if (type === 'carousel') {
      const items = data.items || [{},{},{}];
      inner = `
        <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
          <label class="form-label">Carousel Header</label>
          <input type="text" class="form-input aplus-header" value="${escVal(data.header)}" placeholder="Header" />
        </div>
        <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1.5rem;">
          <label class="form-label">Carousel Subheader</label>
          <input type="text" class="form-input aplus-subheader" value="${escVal(data.subheader)}" placeholder="Subheader" />
        </div>
        <div style="display:flex; flex-direction:column; gap:1rem;" class="aplus-carousel-items">
          ${items.map((it, i) => `
            <div style="background:var(--bg-base); border:1px solid var(--border); padding:1rem; border-radius:var(--radius-sm);">
              <div style="font-weight:600; margin-bottom:0.5rem;">Slide ${i+1}</div>
              <input type="text" class="form-input slide-title" style="margin-bottom:0.5rem;" value="${escVal(it.title)}" placeholder="Slide Title" />
              <input type="text" class="form-input slide-desc" style="margin-bottom:0.5rem;" value="${escVal(it.desc)}" placeholder="Slide Short Description" />
              <input type="url" class="form-input slide-img" value="${escVal(it.mediaUrl)}" placeholder="Image URL" />
            </div>
          `).join('')}
        </div>
      `;
    }

    const typeLabels = {
      'text_image': 'Text (Left) + Media (Right)',
      'image_text': 'Media (Left) + Text (Right)',
      'text_center': 'Text (Center Aligned)',
      'image_full': 'Full Width Image',
      'grid_2x2': '2x2 Media Grid',
      'carousel': 'Interactive Carousel'
    };

    return `
      <div class="aplus-block" data-type="${type}" style="background:var(--bg-surface); border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden;">
        <div style="background:var(--bg-base); padding:0.75rem 1rem; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:600; font-size:0.95rem;">${typeLabels[type]}</div>
          <button type="button" class="btn-remove-aplus" style="background:none; border:none; color:var(--text-secondary); cursor:pointer;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style="padding:1rem;">
          ${inner}
        </div>
      </div>
    `;
  }

  function addAPlusBlock(type, data = {}) {
    const container = document.getElementById('aplus-blocks-container');
    if (container.children.length >= 5) {
      toast("Maximum of 5 A+ sections allowed.", "warning");
      return;
    }
    const div = document.createElement('div');
    div.innerHTML = getAPlusTemplate(type, data);
    const block = div.firstElementChild;
    block.querySelector('.btn-remove-aplus').addEventListener('click', () => {
      block.remove();
      container.dispatchEvent(new Event('input', { bubbles: true }));
    });
    container.appendChild(block);
    container.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function collectAPlusContent() {
    const blocks = [];
    document.querySelectorAll('#aplus-blocks-container .aplus-block').forEach(block => {
      const type = block.dataset.type;
      const data = { type };
      if (type === 'text_image' || type === 'image_text' || type === 'text_center') {
        data.header = block.querySelector('.aplus-header')?.value.trim() || null;
        data.body = block.querySelector('.aplus-body')?.value.trim() || null;
        if (type !== 'text_center') {
          data.mediaUrl = block.querySelector('.aplus-media')?.value.trim() || null;
        }
      } else if (type === 'image_full') {
        data.mediaUrl = block.querySelector('.aplus-media')?.value.trim() || null;
      } else if (type === 'grid_2x2') {
        data.img1 = block.querySelector('.aplus-img1')?.value.trim() || null;
        data.img2 = block.querySelector('.aplus-img2')?.value.trim() || null;
        data.img3 = block.querySelector('.aplus-img3')?.value.trim() || null;
        data.img4 = block.querySelector('.aplus-img4')?.value.trim() || null;
      } else if (type === 'carousel') {
        data.header = block.querySelector('.aplus-header')?.value.trim() || null;
        data.subheader = block.querySelector('.aplus-subheader')?.value.trim() || null;
        const items = [];
        block.querySelectorAll('.aplus-carousel-items > div').forEach(slide => {
          const t = slide.querySelector('.slide-title')?.value.trim();
          const d = slide.querySelector('.slide-desc')?.value.trim();
          const m = slide.querySelector('.slide-img')?.value.trim();
          if (t || d || m) items.push({ title: t, desc: d, mediaUrl: m });
        });
        data.items = items;
      }
      blocks.push(data);
    });
    return blocks.length > 0 ? blocks : null;
  }

  // ─────────────────────────────────────────────────────
  // Save Product
  // ─────────────────────────────────────────────────────
  async function saveProduct() {
    const saveBtn = document.getElementById('drawer-save');
    const statusEl = document.getElementById('drawer-status');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    statusEl.textContent = '';

    try {
      const payload = collectForm();

      if (isBatchEditing) {
        if (touchedFields.size === 0) {
          toast('No changes detected to save.', 'info');
          closeDrawer();
          isBatchEditing = false;
          return;
        }

        const updatePayload = {};
        touchedFields.forEach(fieldId => {
          const key = fieldMapping[fieldId];
          if (key && key !== 'sku' && key !== 'slug') {
            updatePayload[key] = payload[key];
          }
        });

        if (Object.keys(updatePayload).length > 0) {
          const { error } = await sbClient.from('products').update(updatePayload).in('id', selectedProductIds);
          if (error) throw error;
        }

        // Save features if edited in batch
        if (touchedFields.has('features')) {
          const business = document.getElementById('f-business').value;
          const featureDef = FEATURE_DEFS[business];
          if (featureDef) {
            const featData = collectFeatures(business);
            for (const productId of selectedProductIds) {
              const { data: existing } = await sbClient.from(featureDef.table).select('id').eq('product_id', productId).maybeSingle();
              if (existing) {
                await sbClient.from(featureDef.table).update(featData).eq('id', existing.id);
              } else {
                await sbClient.from(featureDef.table).insert({ ...featData, product_id: productId });
              }
            }
          }
        }

        toast(`Updated ${selectedProductIds.length} products successfully!`, 'success');
        selectedProductIds = [];
        const thSelectAll = document.getElementById('th-select-all');
        if (thSelectAll) thSelectAll.checked = false;
        
        await fetchProducts();
        closeDrawer();
        isBatchEditing = false;
        return;
      }

      // Validate single product fields
      if (!payload.sku) throw new Error('SKU is required.');
      if (!payload.title) throw new Error('Title is required.');
      if (!payload.business) throw new Error('Business type is required.');

      let productId = editingId;

      if (editingId) {
        // Update existing product
        payload.id = editingId;
        const { error } = await sbClient.from('products').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        // Insert new product
        const { data, error } = await sbClient.from('products').insert(payload).select('id').single();
        if (error) throw error;
        productId = data.id;
      }

      // Save features
      const business = payload.business;
      const featureDef = FEATURE_DEFS[business];
      if (featureDef) {
        const featData = collectFeatures(business);
        featData.product_id = productId;

        if (editingFeatureId) {
          await sbClient.from(featureDef.table).update(featData).eq('id', editingFeatureId);
        } else {
          // Check if a features row already exists
          const { data: existing } = await sbClient.from(featureDef.table).select('id').eq('product_id', productId).maybeSingle();
          if (existing) {
            await sbClient.from(featureDef.table).update(featData).eq('id', existing.id);
          } else {
            await sbClient.from(featureDef.table).insert(featData);
          }
        }
      }

      toast(editingId ? 'Product updated!' : 'Product created!', 'success');
      await fetchProducts();
      if (!editingId && productId) {
        editingId = productId;
      }
      if (editingId) {
        await openDrawerEdit(editingId);
      } else {
        updateDrawerNavigation();
      }

    } catch (err) {
      console.error(err);
      statusEl.textContent = err.message;
      toast(`Error: ${err.message}`, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Product';
    }
  }

  // ─────────────────────────────────────────────────────
  // Delete Product
  // ─────────────────────────────────────────────────────
  function confirmDelete(id, title) {
    document.getElementById('confirm-body').textContent = `Delete "${title}"? This will also remove all linked features and reviews. This cannot be undone.`;
    deleteCallback = async () => {
      const { error } = await sbClient.from('products').delete().eq('id', id);
      if (error) { toast(`Failed: ${error.message}`, 'error'); return; }
      toast('Product deleted.', 'success');
      await fetchProducts();
    };
    document.getElementById('confirm-modal').classList.add('open');
  }

  // ─────────────────────────────────────────────────────
  // Duplicate Product
  // ─────────────────────────────────────────────────────
  async function duplicateProduct(id) {
    editingId = null;
    editingFeatureId = null;
    isBatchEditing = false;
    touchedFields.clear();
    clearForm();

    const p = allProducts.find(x => x.id === id);
    if (p) {
      const pDup = { ...p };
      delete pDup.sku;
      delete pDup.slug;
      
      fillForm(pDup);
    }
    
    updateDrawerNavigation();
    document.getElementById('drawer-title').textContent = 'Duplicate Product';
    
    document.getElementById('drawer-status').textContent = 'Loading…';
    document.getElementById('product-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
    switchTab('basic');

    if (p && p.business && FEATURE_DEFS[p.business]) {
      const featureDef = FEATURE_DEFS[p.business];
      const { data: fData } = await sbClient.from(featureDef.table).select('*').eq('product_id', id).maybeSingle();
      if (fData) {
        fillFeatures(p.business, fData);
      }
    }
    document.getElementById('drawer-status').textContent = '';
  }

  // ─────────────────────────────────────────────────────
  // Publish (trigger Vercel build)
  // ─────────────────────────────────────────────────────
  async function publishSite() {
    const btn = document.getElementById('btn-publish');
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    try {
      const res = await fetch('https://api.vercel.com/v1/integrations/deploy/prj_8BUBIA4U1128hH2VISQHDhxxTnB3/zAWKAQArmf', { method: 'POST' });
      if (res.ok) {
        toast('Build triggered! Pages go live in ~2 minutes.', 'success');
        const nowStr = new Date().toISOString();
        await sbClient.from('global_settings').upsert({ key: 'last_published_at', company_id: currentCompanyId, value: { timestamp: nowStr } });
        hasUnpublishedChanges = false;
        updatePublishStateUI();
      } else {
        throw new Error(`Status ${res.status}`);
      }
    } catch (e) {
      toast(`Build trigger failed: ${e.message}`, 'error');
      updatePublishStateUI();
    } finally {
      btn.textContent = 'Publish to Live';
    }
  }

  function createTagInput({ inputId, normalize, placeholder, getSuggestions }) {
    const originalInput = document.getElementById(inputId);
    if (!originalInput) return;

    const container = document.createElement('div');
    container.className = 'tag-input-container';
    container.style.position = 'relative';

    const tagsWrapper = document.createElement('span');
    tagsWrapper.style.display = 'flex';
    tagsWrapper.style.flexWrap = 'wrap';
    tagsWrapper.style.gap = '0.35rem';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'tag-text-input';
    textInput.placeholder = originalInput.placeholder || placeholder;

    container.appendChild(tagsWrapper);
    container.appendChild(textInput);

    let suggBox = null;
    if (getSuggestions) {
      suggBox = document.createElement('div');
      suggBox.className = 'tag-suggestions-box';
      suggBox.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: var(--bg-surface, #ffffff);
        border: 1px solid var(--border, #e2e8f0);
        border-radius: var(--radius-sm, 6px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        max-height: 150px;
        overflow-y: auto;
        z-index: 1000;
        display: none;
        margin-top: 4px;
      `;
      container.appendChild(suggBox);
    }

    originalInput.style.display = 'none';
    originalInput.parentNode.insertBefore(container, originalInput);

    let tags = [];

    container.addEventListener('click', (e) => {
      if (tags.length === 1 && (tags[0] === '(mixed)' || tags[0] === '(mixed values)')) {
        tags = [];
        updateTagsUI();
        triggerOriginalChange();
      }
      if (!suggBox || (e.target !== suggBox && !suggBox.contains(e.target))) {
        textInput.focus();
      }
    });

    function updateTagsUI() {
      tagsWrapper.innerHTML = '';
      tags.forEach((tag, idx) => {
        const pill = document.createElement('span');
        pill.className = 'tag-badge';
        pill.textContent = tag;
        if (tag === '(mixed)' || tag === '(mixed values)') {
          pill.style.fontStyle = 'italic';
          pill.style.color = 'var(--text-muted)';
        }

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'tag-badge-close';
        closeBtn.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" style="width:1em;height:1em;display:block;fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        closeBtn.onclick = (e) => {
          e.stopPropagation();
          removeTag(idx);
        };

        if (tag !== '(mixed)' && tag !== '(mixed values)') {
          pill.appendChild(closeBtn);
        }
        tagsWrapper.appendChild(pill);
      });

      if (tags.length > 0) {
        textInput.placeholder = '';
      } else {
        textInput.placeholder = originalInput.placeholder || placeholder;
      }
    }

    function addTag(value) {
      const clean = normalize(value.trim().replace(/,/g, ''));
      if (clean && !tags.includes(clean)) {
        tags.push(clean);
        updateTagsUI();
        triggerOriginalChange();
      }
      if (getSuggestions) hideSuggestions();
    }

    function removeTag(idx) {
      tags.splice(idx, 1);
      updateTagsUI();
      triggerOriginalChange();
      if (getSuggestions) hideSuggestions();
    }

    function triggerOriginalChange() {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor.set.call(originalInput, tags.join(', '));
      originalInput.dispatchEvent(new Event('input', { bubbles: true }));
      originalInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    Object.defineProperty(originalInput, 'value', {
      get() {
        return tags.join(', ');
      },
      set(val) {
        if (val === '(mixed)' || val === '(mixed values)') {
          tags = ['(mixed)'];
        } else {
          const values = val ? val.split(',').map(s => normalize(s.trim())).filter(Boolean) : [];
          tags = [...new Set(values)];
        }
        updateTagsUI();
      },
      configurable: true
    });

    textInput.addEventListener('keydown', (e) => {
      const val = textInput.value;
      if (e.key === ',' || e.key === 'Enter') {
        e.preventDefault();
        addTag(val);
        textInput.value = '';
      } else if (e.key === 'Backspace' && !val && tags.length > 0) {
        removeTag(tags.length - 1);
      }
    });

    textInput.addEventListener('input', () => {
      const val = textInput.value;
      if (val.includes(',')) {
        const parts = val.split(',');
        parts.slice(0, -1).forEach(addTag);
        textInput.value = parts[parts.length - 1];
      }
    });

    if (getSuggestions) {
      function showSuggestions() {
        const allExisting = getSuggestions();
        const currentVal = textInput.value.trim().toLowerCase();
        const unused = allExisting.filter(t => !tags.includes(normalize(t)));
        const matches = currentVal 
          ? unused.filter(t => t.toLowerCase().includes(currentVal))
          : unused;

        if (matches.length === 0) {
          hideSuggestions();
          return;
        }

        suggBox.innerHTML = '';
        matches.forEach(match => {
          const item = document.createElement('div');
          item.style.cssText = `
            padding: 0.5rem 0.75rem;
            cursor: pointer;
            font-size: 0.85rem;
            color: var(--text-primary);
            transition: background 0.15s;
          `;
          item.textContent = match;

          item.addEventListener('mouseenter', () => {
            item.style.background = 'var(--bg-elevated, #f7fafc)';
          });
          item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
          });
          item.addEventListener('mousedown', (e) => {
            e.preventDefault();
            addTag(match);
            textInput.value = '';
            textInput.focus();
          });

          suggBox.appendChild(item);
        });

        suggBox.style.display = 'block';
      }

      function hideSuggestions() {
        suggBox.style.display = 'none';
      }

      textInput.addEventListener('focus', showSuggestions);
      textInput.addEventListener('input', showSuggestions);

      textInput.addEventListener('blur', () => {
        setTimeout(() => {
          if (textInput.value) {
            addTag(textInput.value);
            textInput.value = '';
          }
          hideSuggestions();
        }, 200);
      });
    } else {
      textInput.addEventListener('blur', () => {
        if (textInput.value) {
          addTag(textInput.value);
          textInput.value = '';
        }
      });
    }
  }

  function getAllExistingTags() {
    const tagsSet = new Set();
    if (allProducts) {
      allProducts.forEach(p => {
        if (p.tags && Array.isArray(p.tags)) {
          p.tags.forEach(t => {
            if (t) tagsSet.add(t.toLowerCase().trim());
          });
        }
      });
    }
    return Array.from(tagsSet);
  }

  // ─────────────────────────────────────────────────────
  // Event Binding
  // ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    const authInfo = await window.BKAuth.checkRoleGate(['Products'], '../admin.html');
    if (!authInfo) return;

    try {
      const { data: companyData } = await window.BKAuth.sb.from('companies').select('id').eq('tenant_id', authInfo.tenantId).limit(1);
      if (companyData && companyData.length > 0) {
        currentCompanyId = companyData[0].id;
      }
      
      // Dynamically load feature definitions from the database based on Tenants settings
      if (currentCompanyId) {
        const { data: businesses } = await window.BKAuth.sb.from('tenant_businesses').select('id, name').eq('company_id', currentCompanyId);
        const { data: dbFeatures } = await window.BKAuth.sb.from('business_features').select('business_id, name');
        
        if (businesses && dbFeatures) {
          // Dynamically populate filter-business and f-business dropdowns from tenant_businesses
          const filterBizSelect = document.getElementById('filter-business');
          const formBizSelect = document.getElementById('f-business');
          if (filterBizSelect) {
            filterBizSelect.innerHTML = '<option value="">All Businesses</option>';
            businesses.forEach(b => {
              const key = b.name.toLowerCase().replace(/[\s_.-]+/g, '_');
              filterBizSelect.innerHTML += `<option value="${key}">${b.name}</option>`;
            });
          }
          if (formBizSelect) {
            formBizSelect.innerHTML = '<option value="">— Select —</option>';
            businesses.forEach(b => {
              const key = b.name.toLowerCase().replace(/[\s_.-]+/g, '_');
              formBizSelect.innerHTML += `<option value="${key}">${b.name}</option>`;
            });
          }

          businesses.forEach(biz => {
            const key = biz.name.toLowerCase().replace(/[\s_.-]+/g, '_');
            if (!FEATURE_DEFS[key]) {
              FEATURE_DEFS[key] = {
                table: key.replace(/_/g, '') + '_features',
                label: biz.name,
                features: []
              };
            } else {
              FEATURE_DEFS[key].features = [];
            }
            
            const bizFeats = dbFeatures.filter(f => f.business_id === biz.id);
            bizFeats.forEach(f => {
              // Pretty format matching featureLabel() logic
              let label = f.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              label = label
                .replace(/\bPin\b/g, 'PIN')
                .replace(/\bRfid\b/g, 'RFID')
                .replace(/\bUsb\b/g, 'USB')
                .replace(/\b3d\b/gi, '3D')
                .replace(/\bWifi\b/g, 'WiFi')
                .replace(/\bPoe\b/g, 'PoE')
                .replace(/\bCo2\b/gi, 'CO₂')
                .replace(/\bAbc\b/g, 'ABC')
                .replace(/\bAi\b/g, 'AI')
                .replace(/\bMppt\b/g, 'MPPT');
                
              FEATURE_DEFS[key].features.push({
                col: f.name,
                label: label
              });
            });
          });
        }
      }
    } catch (err) {
      console.error("Error fetching company context or dynamic features:", err);
    }

    fetchProducts();

    // Setup Sort Click Handlers on headers
    document.querySelectorAll('thead th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (currentSortCol === col) {
          currentSortDir = currentSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          currentSortCol = col;
          currentSortDir = 'asc';
        }
        
        document.querySelectorAll('thead th.sortable').forEach(el => {
          el.classList.remove('asc', 'desc');
        });
        th.classList.add(currentSortDir);
        
        applyFilters();
      });
    });
    createTagInput({
      inputId: 'f-related',
      normalize: s => s.toUpperCase(),
      placeholder: 'Type SKU and press comma...'
    });
    createTagInput({
      inputId: 'f-tags',
      normalize: s => s.toLowerCase(),
      placeholder: 'Type tag and press comma...',
      getSuggestions: getAllExistingTags
    });

    document.getElementById('btn-batch-edit').addEventListener('click', openDrawerBatchEdit);

    const productsBody = document.getElementById('products-body');
    if (productsBody) {
      productsBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('row-checkbox')) {
          const id = e.target.dataset.id;
          if (e.target.checked) {
            if (!selectedProductIds.includes(id)) selectedProductIds.push(id);
          } else {
            selectedProductIds = selectedProductIds.filter(x => x !== id);
          }
          updateBatchEditUI();
        }
      });

      productsBody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.btn-edit-product');
        if (editBtn) {
          const id = editBtn.dataset.id;
          if (id) openDrawerEdit(id);
          return;
        }
        const dupBtn = e.target.closest('.btn-duplicate-product');
        if (dupBtn) {
          const id = dupBtn.dataset.id;
          if (id) duplicateProduct(id);
          return;
        }
        const delBtn = e.target.closest('.btn-delete-product');
        if (delBtn) {
          const id = delBtn.dataset.id;
          const title = delBtn.dataset.title;
          if (id) confirmDelete(id, title);
          return;
        }
      });

      // Robust row highlight via JS delegation (CSS :hover breaks on child elements like <a>, <span> badges)
      productsBody.addEventListener('mouseover', (e) => {
        const tr = e.target.closest('tr');
        if (tr) tr.classList.add('row-hover');
      });
      productsBody.addEventListener('mouseout', (e) => {
        const tr = e.target.closest('tr');
        if (tr && !tr.contains(e.relatedTarget)) tr.classList.remove('row-hover');
      });
    }

    const thSelectAll = document.getElementById('th-select-all');
    if (thSelectAll) {
      thSelectAll.addEventListener('change', (e) => {
        const checked = e.target.checked;
        const visibleIds = filtered.map(p => p.id);
        if (checked) {
          visibleIds.forEach(id => {
            if (!selectedProductIds.includes(id)) selectedProductIds.push(id);
          });
        } else {
          selectedProductIds = selectedProductIds.filter(id => !visibleIds.includes(id));
        }
        document.querySelectorAll('.row-checkbox').forEach(cb => {
          cb.checked = checked;
        });
        updateBatchEditUI();
      });
    }

    // Set up listeners to track touched fields for batch saving
    const inputsToTrack = [
      '.form-input', '.form-select', '.form-textarea', '.promo-tag-checkbox',
      '#f-override-rating', '#f-show-on-ecommerce', '#f-count-inventory',
      '#f-show-features', '#f-show-specs'
    ].join(', ');

    document.querySelectorAll(inputsToTrack).forEach(el => {
      const handleEvent = () => {
        if (!isBatchEditing) return;
        el.classList.remove('mixed-value');
        if (el.classList.contains('promo-tag-checkbox')) {
          touchedFields.add('promo_tags');
        } else if (el.id.startsWith('comp-')) {
          touchedFields.add('comparison_table');
        } else {
          touchedFields.add(el.id);
        }
      };
      el.addEventListener('change', handleEvent);
      el.addEventListener('input', handleEvent);
      el.addEventListener('focus', () => {
        if (isBatchEditing && el.classList.contains('mixed-value')) {
          if (el.value === '(mixed)' || el.value === '(mixed values)') {
            el.value = '';
            el.classList.remove('mixed-value');
          }
        }
      });
    });

    // Also track features input events globally
    document.getElementById('features-grid')?.addEventListener('input', (e) => {
      if (isBatchEditing && e.target.classList.contains('feature-input')) {
        e.target.classList.remove('mixed-value');
        touchedFields.add('features');
      }
    });

    // Also track A+ content tab additions and edits
    document.getElementById('btn-add-aplus-block')?.addEventListener('click', () => {
      if (isBatchEditing) touchedFields.add('aplus_content');
    });
    document.getElementById('aplus-blocks-container')?.addEventListener('input', () => {
      if (isBatchEditing) touchedFields.add('aplus_content');
    });
    document.getElementById('aplus-blocks-container')?.addEventListener('change', () => {
      if (isBatchEditing) touchedFields.add('aplus_content');
    });

    document.getElementById('btn-add').addEventListener('click', openDrawerAdd);
    document.getElementById('btn-publish').addEventListener('click', publishSite);
    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('drawer-cancel').addEventListener('click', closeDrawer);
    document.getElementById('f-status').addEventListener('change', updateStatusSelectStyle);

    document.getElementById('f-parent-sku').addEventListener('input', (e) => {
      const val = e.target.value.trim();
      const exists = !val || allProducts.some(x => x.sku && x.sku.toLowerCase() === val.toLowerCase());
      if (exists) {
        e.target.style.borderColor = '';
        e.target.style.boxShadow = '';
      } else {
        e.target.style.borderColor = 'var(--danger)';
        e.target.style.boxShadow = '0 0 0 3px rgba(220, 38, 38, 0.15)';
      }
    });

    document.getElementById('f-related').addEventListener('input', updateRelatedSkuDatalist);
    document.getElementById('f-related').addEventListener('focus', updateRelatedSkuDatalist);

    document.getElementById('drawer-prev').addEventListener('click', () => {
      if (!editingId) return;
      const currentIndex = filtered.findIndex(x => x.id === editingId);
      if (currentIndex > 0) {
        openDrawerEdit(filtered[currentIndex - 1].id);
      }
    });

    document.getElementById('drawer-next').addEventListener('click', () => {
      if (!editingId) return;
      const currentIndex = filtered.findIndex(x => x.id === editingId);
      if (currentIndex !== -1 && currentIndex < filtered.length - 1) {
        openDrawerEdit(filtered[currentIndex + 1].id);
      }
    });

    // ─────────────────────────────────────────────────────
    // Direct Supabase Storage Uploads
    // ─────────────────────────────────────────────────────
    const mediaInputs = document.querySelectorAll('#tab-media input[type="url"]');
    const uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.style.display = 'none';
    document.body.appendChild(uploadInput);

    let currentUploadTarget = null;

    mediaInputs.forEach(input => {
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.gap = '0.5rem';
      
      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      input.style.flex = '1';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline';
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
      btn.title = "Upload to Supabase Storage";
      btn.style.padding = '0 0.75rem';
      
      btn.addEventListener('click', () => {
        const sku = document.getElementById('f-sku')?.value?.trim();
        if (!sku) {
          toast("Please enter an SKU first before uploading media.", "warning");
          return;
        }
        currentUploadTarget = input;
        
        if (input.id.includes('image')) uploadInput.accept = 'image/*';
        else if (input.id.includes('video')) uploadInput.accept = 'video/*';
        else uploadInput.accept = '*/*';
        
        uploadInput.click();
      });

      wrapper.appendChild(btn);
    });

    function compressImageToWebP(file, maxW = 1600, maxH = 1600, quality = 0.82) {
      return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) return resolve(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            let width = img.width;
            let height = img.height;
            if (width > maxW || height > maxH) {
              if (width > height) {
                height = Math.round((height * maxW) / width);
                width = maxW;
              } else {
                width = Math.round((width * maxH) / height);
                height = maxH;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              try {
                if (!blob) return resolve(file);
                const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';
                const webpFile = new File([blob], `${nameWithoutExt}.webp`, {
                  type: 'image/webp',
                  lastModified: Date.now()
                });
                resolve(webpFile);
              } catch (err) {
                console.warn("File constructor error (expected on some Safari versions), falling back to blob decoration:", err);
                try {
                  const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || 'image';
                  blob.name = `${nameWithoutExt}.webp`;
                  resolve(blob);
                } catch (fallbackErr) {
                  resolve(file);
                }
              }
            }, 'image/webp', quality);
          };
          img.onerror = () => resolve(file);
          img.src = e.target.result;
        };
        reader.onerror = () => resolve(file);
        reader.readAsDataURL(file);
      });
    }

    uploadInput.addEventListener('change', async (e) => {
      let file = e.target.files[0];
      if (!file || !currentUploadTarget) return;

      const sku = (document.getElementById('f-sku')?.value || '').trim().toUpperCase();
      const btn = currentUploadTarget.nextElementSibling;
      const originalHtml = btn.innerHTML;
      
      try {
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin 1s linear infinite"><style>@keyframes spin { 100% { transform:rotate(360deg); } }</style><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>';
        btn.disabled = true;

        if (file.type.startsWith('video/')) {
          const limitMB = 50;
          if (file.size > limitMB * 1024 * 1024) {
            throw new Error(`Video exceeds the limit of ${limitMB} MB.`);
          }
        }

        if (file.type.startsWith('image/')) {
          file = await compressImageToWebP(file);
        }

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
            category: 'products',
            refId: sku,
            companyId: currentCompanyId
          })
        });

        let result;
        try {
          result = await response.json();
        } catch (jsonErr) {
          if (response.status === 413) {
            throw new Error('File is too large. Please select a smaller file (under 4.5MB).');
          }
          throw new Error(`Upload failed with status ${response.status}`);
        }
        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Upload failed');
        }

        currentUploadTarget.value = result.url;
        currentUploadTarget.dispatchEvent(new Event('input'));
        
        toast("File uploaded securely!", "success");
      } catch (err) {
        console.error(err);
        toast("Upload failed: " + err.message, "error");
      } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        uploadInput.value = ''; 
      }
    });

    // ─────────────────────────────────────────────────────
    // Auto-convert YouTube links to embed format
    // ─────────────────────────────────────────────────────
    ['f-video-1', 'f-video-2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('blur', () => {
          let val = el.value.trim();
          if (!val) return;
          // Match standard youtube.com/watch?v=XYZ or youtu.be/XYZ
          const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
          const match = val.match(ytRegex);
          if (match && match[1]) {
            el.value = `https://www.youtube.com/embed/${match[1]}`;
          }
        });
      }
    });

    document.getElementById('drawer-overlay').addEventListener('click', closeDrawer);
    document.getElementById('drawer-save').addEventListener('click', saveProduct);

    document.getElementById('search-input').addEventListener('input', applyFilters);
    document.getElementById('filter-business').addEventListener('change', applyFilters);
    document.getElementById('filter-status').addEventListener('change', applyFilters);

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // A+ Content Builder
    document.getElementById('btn-add-aplus-block').addEventListener('click', () => {
      const select = document.getElementById('aplus-block-type');
      addAPlusBlock(select.value);
    });

    // Auto-generate slug from title
    document.getElementById('f-title').addEventListener('input', e => {
      const slugEl = document.getElementById('f-slug');
      if (!slugEl.dataset.manual) slugEl.value = slugify(e.target.value);
    });
    document.getElementById('f-slug').addEventListener('input', e => {
      e.target.dataset.manual = e.target.value ? 'true' : '';
    });

    // Business change → re-render features tab
    document.getElementById('f-business').addEventListener('change', e => {
      renderFeaturesTab(e.target.value);
    });

    // Price inputs → live preview
    ['f-sale-price','f-discounted-price','f-before-price','f-install-price','f-dealer-price'].forEach(id => {
      document.getElementById(id).addEventListener('input', updatePricePreview);
    });

    // Image inputs → live preview
    ['f-image-main','f-image-1','f-image-2','f-image-3','f-image-4'].forEach(id => {
      document.getElementById(id).addEventListener('input', updateMediaPreviews);
    });

    // Confirm modal
    document.getElementById('confirm-cancel').addEventListener('click', () => {
      document.getElementById('confirm-modal').classList.remove('open');
      deleteCallback = null;
    });
    document.getElementById('confirm-ok').addEventListener('click', async () => {
      document.getElementById('confirm-modal').classList.remove('open');
      if (deleteCallback) await deleteCallback();
      deleteCallback = null;
    });

    // ─────────────────────────────────────────────────────
    // Autosave functionality
    // ─────────────────────────────────────────────────────
    let autosaveTimeout = null;
    function triggerAutosave() {
      if (!editingId || isBatchEditing) return;

      if (autosaveTimeout) clearTimeout(autosaveTimeout);

      const statusEl = document.getElementById('drawer-status');
      if (statusEl) {
        statusEl.textContent = 'Autosaving...';
        statusEl.style.color = 'var(--text-secondary)';
      }

      autosaveTimeout = setTimeout(async () => {
        try {
          const payload = collectForm();
          if (!payload.sku || !payload.title || !payload.business) return;

          payload.id = editingId;
          const { error } = await sbClient.from('products').update(payload).eq('id', editingId);
          if (error) throw error;

          const business = payload.business;
          const featureDef = FEATURE_DEFS[business];
          if (featureDef) {
            const featData = collectFeatures(business);
            featData.product_id = editingId;

            if (editingFeatureId) {
              await sbClient.from(featureDef.table).update(featData).eq('id', editingFeatureId);
            } else {
              const { data: existing } = await sbClient.from(featureDef.table).select('id').eq('product_id', editingId).maybeSingle();
              if (existing) {
                await sbClient.from(featureDef.table).update(featData).eq('id', existing.id);
                editingFeatureId = existing.id;
              } else {
                const { data: newFeat } = await sbClient.from(featureDef.table).insert(featData).select('id').maybeSingle();
                if (newFeat) {
                  editingFeatureId = newFeat.id;
                }
              }
            }
          }

          // Quietly refresh list
          await fetchProducts();

          if (statusEl) {
            statusEl.textContent = 'Saved!';
            statusEl.style.color = 'var(--success)';
            setTimeout(() => {
              if (statusEl.textContent === 'Saved!') statusEl.textContent = '';
            }, 1500);
          }
        } catch (err) {
          console.error('Autosave failed:', err);
          if (statusEl) {
            statusEl.textContent = `Autosave failed: ${err.message}`;
            statusEl.style.color = 'var(--danger)';
          }
        }
      }, 1000);
    }

    const drawerEl = document.getElementById('product-drawer');
    if (drawerEl) {
      const handleAutosaveEvent = (e) => {
        if (!e.target) return;
        if (e.target.matches('input, textarea, select')) {
          if (e.target.id.startsWith('f-') || e.target.classList.contains('promo-tag-checkbox') || e.target.classList.contains('feature-input') || e.target.closest('.comparison-block') || e.target.closest('.aplus-block')) {
            triggerAutosave();
          }
        }
      };
      drawerEl.addEventListener('input', handleAutosaveEvent);
      drawerEl.addEventListener('change', handleAutosaveEvent);
    }
  });

  // Expose for inline onclick
  window.openDrawerEdit = openDrawerEdit;
  window.confirmDelete = confirmDelete;
  window.duplicateProduct = duplicateProduct;
  window.markFeatureX = markFeatureX;
  window.onFeatureInput = onFeatureInput;