(function initProductsGallery() {
  'use strict';

  const FEATURE_TABLES = {
    smart_lock: 'smartlock_features',
    solar_power: 'solarpower_features',
    cctv: 'cctv_features',
    fire_extinguisher: 'fireextinguisher_features'
  };
  const PAGE_SIZE = 9;

  const FEATURE_LABELS = {
    app_control: 'App Control',
    bluetooth: 'Bluetooth Connect',
    doorbell: 'Built-in Doorbell',
    dual_cameras: 'Dual Cameras',
    emergency_usb: 'Emergency USB Power Port',
    face_recognition_3d: '3D Facial Recognition',
    fingerprint_unlock: 'Fingerprint Unlock',
    intercom: 'Active Intercom',
    mechanical_key: 'Mechanical Key Unlock',
    moisture_proof: 'Moisture Proof',
    palm_vein_unlock: 'Palm Vein Unlock',
    pin_unlock: 'PIN Unlock',
    rfid_unlock: 'RFID Unlock',
    scratchproof: 'Scratchproof',
    splash_proof: 'Splash Proof',
    sunproof: 'Sunproof',
    temporary_pin: 'Temporary PIN',
    waterproof: 'Waterproof',
    wifi: 'WiFi Connect',
    wifi_connect: 'WiFi Connect'
  };

  const state = {
    products: [],
    filtered: [],
    selectedFeatures: new Set(),
    query: '',
    category: '',
    minPrice: 0,
    maxPrice: 0,
    priceCeiling: 0,
    sort: 'sku',
    visibleCount: PAGE_SIZE,
    loadingMore: false
  };

  const dom = {
    gallery: document.getElementById('product-gallery'),
    empty: document.getElementById('catalog-empty'),
    resultsCount: document.getElementById('results-count'),
    search: document.getElementById('product-search'),
    category: document.getElementById('category-filter'),
    minPrice: document.getElementById('price-min'),
    maxPrice: document.getElementById('price-max'),
    priceLabel: document.getElementById('price-range-label'),
    priceFill: document.getElementById('price-range-fill'),
    features: document.getElementById('feature-filters'),
    clearFeatures: document.getElementById('clear-features'),
    reset: document.getElementById('reset-filters'),
    emptyReset: document.getElementById('empty-reset'),
    sort: document.getElementById('sort-products'),
    loadMore: document.getElementById('catalog-load-more'),
    filters: document.getElementById('catalog-filters'),
    filterOverlay: document.getElementById('catalog-filter-overlay'),
    filterTrigger: document.getElementById('catalog-filter-trigger'),
    filterClose: document.getElementById('catalog-filter-close'),
    filterApply: document.getElementById('catalog-apply-mobile'),
    activeFilterCount: document.getElementById('active-filter-count')
  };

  function apiHeaders() {
    return {
      apikey: window.SUPABASE_ANON || SUPABASE_ANON,
      Authorization: `Bearer ${window.SUPABASE_ANON || SUPABASE_ANON}`
    };
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatWords(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase())
      .replace(/\bWifi\b/g, 'WiFi')
      .replace(/\bRfid\b/g, 'RFID')
      .replace(/\bUsb\b/g, 'USB')
      .replace(/\bPin\b/g, 'PIN')
      .replace(/\b3d\b/gi, '3D');
  }

  function formatFeature(column, value) {
    const label = FEATURE_LABELS[column] || formatWords(column);
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized.toLowerCase() === 'x' || normalized.toLowerCase() === 'true') {
      return label;
    }
    return `${label}: ${normalized}`;
  }

  function getPrice(product) {
    const cents = Number(product.discounted_price) > 0
      ? Number(product.discounted_price)
      : Number(product.installation_price) || Number(product.sale_price) || 0;
    return Math.max(0, cents / 100);
  }

  function money(pesos) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(pesos) || 0);
  }

  function slugify(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function productUrl(product) {
    const fallback = slugify(`${product.title || ''} ${product.sku || ''}`);
    return `/products/${encodeURIComponent(product.slug || fallback)}`;
  }

  function productFeatures(product) {
    return Array.isArray(product._features) ? product._features : [];
  }

  function productSpecs(product) {
    return [
      ['Dimension', product.spec_dimension],
      ['Warranty', product.spec_warranty],
      ['Technical Support', product.spec_support],
      ['Material', product.spec_material],
      ['Voltage', product.spec_voltage]
    ].filter(([, value]) => value && String(value).trim());
  }

  function featureTableRowsToMap(rows) {
    const map = new Map();
    (rows || []).forEach(row => {
      const features = Object.entries(row)
        .filter(([column, value]) => (
          !['id', 'product_id', 'created_at', 'updated_at', 'company_id'].includes(column)
          && value !== null
          && value !== false
          && String(value).trim() !== ''
        ))
        .map(([column, value]) => formatFeature(column, value));
      map.set(row.product_id, features);
    });
    return map;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { headers: apiHeaders() });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  }

  async function loadFeatureData(products) {
    const byProduct = new Map();
    const requests = Object.entries(FEATURE_TABLES).map(async ([business, table]) => {
      const ids = products.filter(product => product.business === business).map(product => product.id);
      if (!ids.length) return;
      const query = `product_id=in.(${ids.join(',')})&select=*`;
      try {
        const rows = await fetchJson(`${SUPABASE_URL}/rest/v1/${table}?${query}`);
        featureTableRowsToMap(rows).forEach((features, productId) => byProduct.set(productId, features));
      } catch (error) {
        console.warn(`Could not load ${business} features.`, error);
      }
    });
    await Promise.all(requests);
    return byProduct;
  }

  async function loadProducts() {
    const fields = [
      'id', 'company_id', 'business', 'category', 'sku', 'slug', 'title', 'description',
      'image_main', 'installation_price', 'sale_price', 'discounted_price', 'before_price',
      'spec_dimension', 'spec_warranty', 'spec_support', 'spec_material', 'spec_voltage'
    ].join(',');
    const query = [
      'status=eq.published',
      'parent_sku=is.null',
      'show_on_ecommerce=eq.true',
      `select=${fields}`,
      'order=sku.asc'
    ].join('&');
    const products = await fetchJson(`${SUPABASE_URL}/rest/v1/products?${query}`);
    const features = await loadFeatureData(products);

    products.forEach((product, index) => {
      product._index = index;
      product._price = getPrice(product);
      product._features = features.get(product.id) || [];
      product._search = [
        product.sku,
        product.title,
        product.category,
        product.business,
        product.description,
        ...product._features
      ].filter(Boolean).join(' ').toLowerCase();
    });

    return products;
  }

  function renderCategories() {
    const categories = [...new Set(state.products.map(product => (
      product.category || product.business
    )).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    const fragment = document.createDocumentFragment();
    categories.forEach(category => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = formatWords(category);
      fragment.appendChild(option);
    });
    dom.category.appendChild(fragment);
  }

  function renderFeatureFilters() {
    const counts = new Map();
    state.products.forEach(product => {
      new Set(productFeatures(product)).forEach(feature => {
        counts.set(feature, (counts.get(feature) || 0) + 1);
      });
    });

    dom.features.textContent = '';
    const sorted = [...counts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true }));

    if (!sorted.length) {
      const note = document.createElement('p');
      note.className = 'filter-value';
      note.textContent = 'No feature filters are available yet.';
      dom.features.appendChild(note);
      return;
    }

    sorted.forEach(([feature, count], index) => {
      const label = document.createElement('label');
      label.className = 'feature-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = feature;
      checkbox.id = `feature-${index}`;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) state.selectedFeatures.add(feature);
        else state.selectedFeatures.delete(feature);
        applyFilters();
      });

      const name = document.createElement('span');
      name.textContent = feature;
      const total = document.createElement('span');
      total.className = 'feature-option__count';
      total.textContent = count;

      label.append(checkbox, name, total);
      dom.features.appendChild(label);
    });
  }

  function setupPriceRange() {
    const actualMax = Math.max(0, ...state.products.map(product => product._price));
    const ceiling = Math.max(1000, Math.ceil(actualMax / 1000) * 1000);
    state.priceCeiling = ceiling;
    state.minPrice = 0;
    state.maxPrice = ceiling;
    [dom.minPrice, dom.maxPrice].forEach(input => {
      input.max = String(ceiling);
      input.step = ceiling > 50000 ? '500' : '100';
    });
    dom.minPrice.value = '0';
    dom.maxPrice.value = String(ceiling);
    updatePriceDisplay();
  }

  function updatePriceDisplay() {
    const min = Number(dom.minPrice.value);
    const max = Number(dom.maxPrice.value);
    const ceiling = state.priceCeiling || 1;
    dom.priceLabel.textContent = `${money(min)} – ${money(max)}`;
    dom.priceFill.style.left = `${(min / ceiling) * 100}%`;
    dom.priceFill.style.right = `${100 - (max / ceiling) * 100}%`;
  }

  function hasActiveFilters() {
    return Boolean(
      state.query
      || state.category
      || state.selectedFeatures.size
      || state.minPrice > 0
      || state.maxPrice < state.priceCeiling
    );
  }

  function updateFilterControls() {
    const activeCount = (
      (state.query ? 1 : 0)
      + (state.category ? 1 : 0)
      + state.selectedFeatures.size
      + ((state.minPrice > 0 || state.maxPrice < state.priceCeiling) ? 1 : 0)
    );
    dom.reset.disabled = !hasActiveFilters();
    dom.clearFeatures.hidden = state.selectedFeatures.size === 0;
    dom.activeFilterCount.hidden = activeCount === 0;
    dom.activeFilterCount.textContent = String(activeCount);
  }

  function sortProducts(products) {
    const sorted = [...products];
    if (state.sort === 'price-asc') sorted.sort((a, b) => a._price - b._price);
    else if (state.sort === 'price-desc') sorted.sort((a, b) => b._price - a._price);
    else if (state.sort === 'title') sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    else if (state.sort === 'sku') sorted.sort((a, b) => (
      String(a.sku || '').localeCompare(String(b.sku || ''), undefined, { numeric: true, sensitivity: 'base' })
    ));
    else sorted.sort((a, b) => a._index - b._index);
    return sorted;
  }

  function applyFilters() {
    state.query = dom.search.value.trim().toLowerCase();
    state.category = dom.category.value;
    state.minPrice = Number(dom.minPrice.value);
    state.maxPrice = Number(dom.maxPrice.value);
    state.sort = dom.sort.value;

    const filtered = state.products.filter(product => {
      const category = product.category || product.business || '';
      const features = productFeatures(product);
      const matchesSearch = !state.query || product._search.includes(state.query);
      const matchesCategory = !state.category || category === state.category;
      const matchesPrice = product._price >= state.minPrice && product._price <= state.maxPrice;
      const matchesFeatures = [...state.selectedFeatures].every(feature => features.includes(feature));
      return matchesSearch && matchesCategory && matchesPrice && matchesFeatures;
    });

    state.filtered = sortProducts(filtered);
    state.visibleCount = PAGE_SIZE;
    updatePriceDisplay();
    updateFilterControls();
    renderProducts();
  }

  function cardMarkup(product) {
    const features = productFeatures(product).slice(0, 4);
    const specs = productSpecs(product);
    const category = formatWords(product.category || product.business || 'Product');
    const url = productUrl(product);
    const price = product._price;
    const compare = Number(product.before_price) / 100;
    const hasCompare = Number.isFinite(compare) && compare > 0;
    const image = product.image_main;

    const media = image
      ? `<img src="${esc(image)}" alt="${esc(product.title || product.sku || 'Product')}" loading="lazy" decoding="async" />`
      : '<div class="product-card__placeholder">Image coming soon</div>';

    const featureMarkup = features.length
      ? `<div class="product-card__features">${features.map(feature => `<span class="product-card__feature">${esc(feature)}</span>`).join('')}</div>`
      : `<p class="product-card__details-note">${esc((product.description || 'View the product page for full features.').slice(0, 105))}</p>`;

    const specMarkup = specs.length
      ? `<div class="product-card__specs">${specs.map(([label, value]) => `
          <div class="product-card__spec"><span>${esc(label)}:</span> <strong>${esc(value)}</strong></div>
        `).join('')}</div>`
      : '<p class="product-card__details-note">Detailed specifications are available on the product page.</p>';

    return `
      <article class="product-card" tabindex="0" data-product-url="${esc(url)}" aria-label="View ${esc(product.title || product.sku)}">
        <div class="product-card__media">
          <span class="product-card__category">${esc(category)}</span>
          ${media}
        </div>
        <div class="product-card__body">
          <p class="product-card__sku">${esc(product.sku || 'Product')}</p>
          <h3>${esc(product.title || product.sku || 'Untitled product')}</h3>
          <div class="product-card__price-row">
            ${hasCompare ? `<span class="product-card__compare">${money(compare)}</span>` : ''}
            <span class="product-card__price">${money(price)}</span>
          </div>
          <div class="product-card__section">
            <span class="product-card__label">Features</span>
            ${featureMarkup}
          </div>
          <div class="product-card__section">
            <span class="product-card__label">Specifications</span>
            ${specMarkup}
          </div>
          <div class="product-card__actions">
            <button class="product-card__add" type="button" data-add-product="${esc(product.id)}">Add to Cart</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderProducts() {
    const visibleProducts = state.filtered.slice(0, state.visibleCount);
    const hasMore = visibleProducts.length < state.filtered.length;
    dom.gallery.setAttribute('aria-busy', 'false');
    dom.resultsCount.textContent = state.filtered.length
      ? `Showing ${visibleProducts.length} of ${state.filtered.length} products`
      : '0 products';
    dom.empty.hidden = state.filtered.length > 0;
    dom.gallery.hidden = state.filtered.length === 0;
    dom.loadMore.hidden = !hasMore;
    dom.gallery.innerHTML = visibleProducts.map(cardMarkup).join('');

    dom.gallery.querySelectorAll('.product-card').forEach(card => {
      const navigate = () => { window.location.href = card.dataset.productUrl; };
      card.addEventListener('click', event => {
        if (event.target.closest('button, a')) return;
        navigate();
      });
      card.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
          event.preventDefault();
          navigate();
        }
      });
    });

    dom.gallery.querySelectorAll('[data-add-product]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        const product = state.products.find(item => item.id === button.dataset.addProduct);
        if (!product) return;
        if (typeof window.addToCart !== 'function' && typeof addToCart !== 'function') {
          window.Toast?.error('The cart is still loading. Please try again in a moment.');
          return;
        }
        const add = window.addToCart || addToCart;
        add({
          id: product.id,
          sku: product.sku,
          title: product.title || product.sku || 'Product',
          slug: product.slug || slugify(`${product.title || ''} ${product.sku || ''}`),
          price: Math.round(product._price * 100),
          image: product.image_main || '/assets/og-image.png',
          quantity: 1,
          business: product.business || ''
        });
      });
    });
  }

  function resetFilters() {
    dom.search.value = '';
    dom.category.value = '';
    dom.minPrice.value = '0';
    dom.maxPrice.value = String(state.priceCeiling);
    dom.features.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
    state.selectedFeatures.clear();
    applyFilters();
  }

  function openFilters() {
    dom.filters.classList.add('is-open');
    dom.filterOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeFilters() {
    dom.filters.classList.remove('is-open');
    dom.filterOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function bindEvents() {
    let searchTimer;
    dom.search.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(applyFilters, 120);
    });
    dom.category.addEventListener('change', applyFilters);
    dom.sort.addEventListener('change', applyFilters);
    dom.minPrice.addEventListener('input', () => {
      if (Number(dom.minPrice.value) > Number(dom.maxPrice.value)) {
        dom.minPrice.value = dom.maxPrice.value;
      }
      applyFilters();
    });
    dom.maxPrice.addEventListener('input', () => {
      if (Number(dom.maxPrice.value) < Number(dom.minPrice.value)) {
        dom.maxPrice.value = dom.minPrice.value;
      }
      applyFilters();
    });
    dom.reset.addEventListener('click', resetFilters);
    dom.emptyReset.addEventListener('click', resetFilters);
    dom.clearFeatures.addEventListener('click', () => {
      state.selectedFeatures.clear();
      dom.features.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = false; });
      applyFilters();
    });
    dom.filterTrigger.addEventListener('click', openFilters);
    dom.filterClose.addEventListener('click', closeFilters);
    dom.filterOverlay.addEventListener('click', closeFilters);
    dom.filterApply.addEventListener('click', closeFilters);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeFilters();
    });
  }

  function initInfiniteScroll() {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting || state.loadingMore || dom.loadMore.hidden) return;
      state.loadingMore = true;
      window.setTimeout(() => {
        state.visibleCount = Math.min(state.visibleCount + PAGE_SIZE, state.filtered.length);
        renderProducts();
        state.loadingMore = false;
      }, 180);
    }, { rootMargin: '240px 0px', threshold: 0.01 });
    observer.observe(dom.loadMore);
  }

  async function start() {
    const yearEl = document.getElementById('catalog-year') || document.getElementById('current-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
    bindEvents();
    initInfiniteScroll();
    try {
      state.products = await loadProducts();
      renderCategories();
      renderFeatureFilters();
      setupPriceRange();
      applyFilters();
    } catch (error) {
      console.error('Catalog load failed.', error);
      dom.gallery.hidden = true;
      dom.gallery.setAttribute('aria-busy', 'false');
      dom.resultsCount.textContent = 'Products unavailable';
      dom.empty.hidden = false;
      dom.empty.querySelector('h3').textContent = 'The catalog could not be loaded';
      dom.empty.querySelector('p').textContent = 'Please refresh the page or try again in a few moments.';
      dom.emptyReset.textContent = 'Try again';
      dom.emptyReset.onclick = () => window.location.reload();
    }
  }

  start();
})();
