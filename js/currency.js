(function () {
  'use strict';

  const DEFAULT_SYMBOL = '₱';
  const DEFAULT_COUNTRY = 'Philippines';
  const ATTRIBUTE_NAMES = ['placeholder', 'title', 'aria-label'];
  let symbol = validSymbol(window.BKStorefrontCurrencySymbol);
  let country = String(window.BKStorefrontCountry || DEFAULT_COUNTRY).trim() || DEFAULT_COUNTRY;
  let loadedCompanyId = null;

  function validSymbol(value) {
    const normalized = String(value || '').trim();
    return normalized && Array.from(normalized).length <= 2 ? normalized : DEFAULT_SYMBOL;
  }

  function replacePeso(value) {
    return symbol === DEFAULT_SYMBOL ? value : String(value).replaceAll(DEFAULT_SYMBOL, symbol);
  }

  function updateElement(element) {
    if (!(element instanceof Element) || element.matches('script, style')) return;
    ATTRIBUTE_NAMES.forEach(name => {
      if (!element.hasAttribute(name)) return;
      const current = element.getAttribute(name);
      const next = replacePeso(current);
      if (next !== current) element.setAttribute(name, next);
    });
  }

  function updateNode(root) {
    if (root.nodeType === Node.TEXT_NODE) {
      const parent = root.parentElement;
      if (!parent?.matches('script, style') && root.data.includes(DEFAULT_SYMBOL)) {
        const next = replacePeso(root.data);
        if (next !== root.data) root.data = next;
      }
      return;
    }
    if (!(root instanceof Element || root instanceof Document)) return;
    if (root instanceof Element) updateElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) node.nodeType === Node.TEXT_NODE ? updateNode(node) : updateElement(node);
  }

  function setConfig(config = {}) {
    symbol = validSymbol(config.symbol);
    country = String(config.country || DEFAULT_COUNTRY).trim() || DEFAULT_COUNTRY;
    document.documentElement.dataset.currencySymbol = symbol;
    updateNode(document.body);
    window.dispatchEvent(new CustomEvent('bk:currency-ready', { detail: { symbol, country } }));
  }

  async function load(companyId) {
    if (!companyId || companyId === loadedCompanyId || !window.BKAuth?.sb) return;
    loadedCompanyId = companyId;
    const { data, error } = await window.BKAuth.sb.from('global_settings').select('value').eq('company_id', companyId).eq('key', 'company_profile_config').maybeSingle();
    if (error) { loadedCompanyId = null; console.warn('Unable to load company currency settings:', error.message); return; }
    const config = data?.value || {};
    setConfig({ symbol: config.currencySymbol, country: config.country });
  }

  window.BKCurrency = {
    get symbol() { return symbol; },
    get country() { return country; },
    setConfig,
    format(value, options = {}) {
      const amount = Number(value) || 0;
      const formatted = amount.toLocaleString(options.locale, {
        minimumFractionDigits: options.minimumFractionDigits ?? 2,
        maximumFractionDigits: options.maximumFractionDigits ?? 2
      });
      return `${options.sign || ''}${symbol}${formatted}`;
    },
    formatCents(cents, options = {}) { return this.format((Number(cents) || 0) / 100, options); }
  };

  if (window.BKStorefrontCurrencySymbol) setConfig({ symbol, country });

  new MutationObserver(records => records.forEach(record => {
    if (record.type === 'characterData') updateNode(record.target);
    else record.addedNodes.forEach(updateNode);
  })).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  window.addEventListener('bk:company-ready', event => load(event.detail?.companyId));
  if (window.BKActiveCompanyId) load(window.BKActiveCompanyId);
}());
