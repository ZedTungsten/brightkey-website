(function () {
  'use strict';

  const toCents = value => Math.round((Number(value) || 0) * 100);
  const fromCents = value => (Number(value) || 0) / 100;
  const cutoffKey = (monthKey, employeeId, day) => `${monthKey}|${employeeId}|${Number(day)}`;
  const cutoffOrder = (monthKey, day) => `${monthKey}-${String(Number(day) || 0).padStart(2, '0')}`;

  function isPaid(entry) {
    return entry === true || Boolean(entry?.checked);
  }

  function isSnapshot(entry) {
    return Boolean(entry && typeof entry === 'object' && Number.isFinite(Number(entry.source_value_centavos)));
  }

  function systemAdjustment(app, employeeId, monthKey, day) {
    const currentOrder = cutoffOrder(monthKey, day);
    const systemSources = {};
    let totalCentavos = 0;

    Object.entries(app.regularPayoutState || {}).forEach(([originMonth, entries]) => {
      Object.entries(entries || {}).forEach(([entryKey, origin]) => {
        if (!entryKey.startsWith(`${employeeId}_`) || !isPaid(origin) || !isSnapshot(origin)) return;
        const originDay = Number(entryKey.slice(employeeId.length + 1));
        const originOrder = cutoffOrder(originMonth, originDay);
        if (originOrder >= currentOrder) return;

        const originKey = cutoffKey(originMonth, employeeId, originDay);
        const currentSource = app.getReconcilablePayoutCentavos(employeeId, originMonth, originDay);
        let alreadyCarried = 0;

        Object.entries(app.regularPayoutState || {}).forEach(([paidMonth, paidEntries]) => {
          Object.entries(paidEntries || {}).forEach(([paidKey, paidEntry]) => {
            if (!paidKey.startsWith(`${employeeId}_`) || !isPaid(paidEntry) || !isSnapshot(paidEntry)) return;
            const paidDay = Number(paidKey.slice(employeeId.length + 1));
            const paidOrder = cutoffOrder(paidMonth, paidDay);
            if (paidOrder <= originOrder || paidOrder >= currentOrder) return;
            alreadyCarried += Number(paidEntry.system_sources?.[originKey]) || 0;
          });
        });

        const outstanding = currentSource - Number(origin.source_value_centavos) - alreadyCarried;
        if (outstanding === 0) return;
        systemSources[originKey] = outstanding;
        totalCentavos += outstanding;
      });
    });

    return { value: fromCents(totalCentavos), valueCentavos: totalCentavos, systemSources };
  }

  function createSnapshot({ sourceValue, paidValue, systemSources }) {
    return {
      checked: true,
      source_value_centavos: toCents(sourceValue),
      paid_value_centavos: toCents(paidValue),
      system_sources: systemSources || {},
      locked_at: new Date().toISOString()
    };
  }

  window.BKPayoutSnapshots = {
    createSnapshot,
    fromCents,
    isPaid,
    isSnapshot,
    systemAdjustment
  };
})();
