'use strict';

(function () {
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');

  function restore(app, { fromEl, toEl, lastValid }) {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const from = params.get('datefrom');
    const to = params.get('dateto');
    const validRange = !validDate(from) || !validDate(to) || from <= to;

    if (validRange && validDate(from)) fromEl.value = from;
    if (validRange && validDate(to)) toEl.value = to;
    lastValid.from = fromEl.value;
    lastValid.to = toEl.value;
    if (fromEl.value) toEl.setAttribute('min', fromEl.value);
    if (toEl.value) fromEl.setAttribute('max', toEl.value);

    const searchEl = document.getElementById('f-search');
    if (searchEl) searchEl.value = (params.get('search') || '').slice(0, 200);
    app.prioritizeSnapshot = params.get('snapshot') === '1';
    const snapshotEl = document.getElementById('prioritize-snapshot-chk');
    if (snapshotEl) snapshotEl.checked = app.prioritizeSnapshot;
    app.selectedAccounts = new Set(params.getAll('account').filter(Boolean));
  }

  function sync(app) {
    const filters = app.getFilters();
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set('datefrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateto', filters.dateTo);
    [...filters.selectedAccounts].sort().forEach(account => params.append('account', account));
    if (filters.search) params.set('search', filters.search);
    if (filters.prioritizeSnapshot) params.set('snapshot', '1');

    const hash = params.toString();
    const nextUrl = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ''}`;
    window.history.replaceState(null, '', nextUrl);
  }

  window.JournalUrlState = { restore, sync };
})();
