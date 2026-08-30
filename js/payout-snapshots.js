(function () {
  'use strict';

  const toCents = value => Math.round((Number(value) || 0) * 100);
  const fromCents = value => (Number(value) || 0) / 100;
  const cutoffKey = (monthKey, employeeId, day) => `${monthKey}|${employeeId}|${Number(day)}`;
  const cutoffOrder = (monthKey, day) => `${monthKey}-${String(Number(day) || 0).padStart(2, '0')}`;
  const componentKeys = ['installation', 'commission', 'adjustment', 'reimbursement'];

  function isPaid(entry) {
    return entry === true || Boolean(entry?.checked);
  }

  function isSnapshot(entry) {
    return Boolean(entry && typeof entry === 'object' && Number.isFinite(Number(entry.source_value_centavos)));
  }

  function systemAdjustment(app, employeeId, monthKey, day) {
    const currentOrder = cutoffOrder(monthKey, day);
    const systemSources = {};
    const rolloverSources = {};
    const rolloversCentavos = Object.fromEntries(componentKeys.map(key => [key, 0]));
    let totalCentavos = 0;

    Object.entries(app.regularPayoutState || {}).forEach(([originMonth, entries]) => {
      Object.entries(entries || {}).forEach(([entryKey, origin]) => {
        if (!entryKey.startsWith(`${employeeId}_`) || !isPaid(origin) || !isSnapshot(origin)) return;
        const originDay = Number(entryKey.slice(employeeId.length + 1));
        const originOrder = cutoffOrder(originMonth, originDay);
        if (originOrder >= currentOrder) return;

        const originKey = cutoffKey(originMonth, employeeId, originDay);
        if (origin.source_components_centavos && typeof app.getReconcilablePayoutComponentsCentavos === 'function') {
          let previouslyCarriedTotal = 0;
          Object.entries(app.regularPayoutState || {}).forEach(([paidMonth, paidEntries]) => {
            Object.entries(paidEntries || {}).forEach(([paidKey, paidEntry]) => {
              if (!paidKey.startsWith(`${employeeId}_`) || !isPaid(paidEntry) || !isSnapshot(paidEntry)) return;
              const paidDay = Number(paidKey.slice(employeeId.length + 1));
              const paidOrder = cutoffOrder(paidMonth, paidDay);
              if (paidOrder <= originOrder || paidOrder >= currentOrder) return;
              previouslyCarriedTotal += Number(paidEntry.system_sources?.[originKey]) || 0;
            });
          });
          const legacyOutstanding = Math.max(0, (Number(origin.legacy_outstanding_centavos) || 0) - previouslyCarriedTotal);
          if (legacyOutstanding > 0) {
            systemSources[originKey] = legacyOutstanding;
            totalCentavos += legacyOutstanding;
          }

          const currentComponents = app.getReconcilablePayoutComponentsCentavos(employeeId, originMonth, originDay);
          const originRollover = {};
          componentKeys.forEach(component => {
            let alreadyCarried = 0;
            Object.entries(app.regularPayoutState || {}).forEach(([paidMonth, paidEntries]) => {
              Object.entries(paidEntries || {}).forEach(([paidKey, paidEntry]) => {
                if (!paidKey.startsWith(`${employeeId}_`) || !isPaid(paidEntry) || !isSnapshot(paidEntry)) return;
                const paidDay = Number(paidKey.slice(employeeId.length + 1));
                const paidOrder = cutoffOrder(paidMonth, paidDay);
                if (paidOrder <= originOrder || paidOrder >= currentOrder) return;
                alreadyCarried += Number(paidEntry.rollover_sources?.[originKey]?.[component]) || 0;
              });
            });
            const outstanding = (Number(currentComponents?.[component]) || 0)
              - (Number(origin.source_components_centavos?.[component]) || 0)
              - alreadyCarried;
            if (outstanding <= 0) return;
            originRollover[component] = outstanding;
            rolloversCentavos[component] += outstanding;
            totalCentavos += outstanding;
          });
          if (Object.keys(originRollover).length > 0) {
            rolloverSources[originKey] = originRollover;
            systemSources[originKey] = (systemSources[originKey] || 0)
              + Object.values(originRollover).reduce((sum, value) => sum + value, 0);
          }
          return;
        }

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
        // Automatic reconciliation may add missed earnings, but it must not
        // reduce a later payout while historical-source migrations are being reviewed.
        if (outstanding <= 0) return;
        systemSources[originKey] = outstanding;
        totalCentavos += outstanding;
      });
    });

    return {
      value: fromCents(totalCentavos),
      valueCentavos: totalCentavos,
      systemSources,
      rolloverSources,
      rollovers: Object.fromEntries(componentKeys.map(key => [key, fromCents(rolloversCentavos[key])]))
    };
  }

  function createSnapshot({ sourceValue, paidValue, systemSources, sourceComponents, rolloverSources }) {
    return {
      checked: true,
      source_value_centavos: toCents(sourceValue),
      paid_value_centavos: toCents(paidValue),
      system_sources: systemSources || {},
      source_components_centavos: sourceComponents
        ? Object.fromEntries(componentKeys.map(key => [key, toCents(sourceComponents[key])]))
        : undefined,
      rollover_sources: rolloverSources || {},
      locked_at: new Date().toISOString()
    };
  }

  function rolloversFromSources(rolloverSources) {
    const totals = Object.fromEntries(componentKeys.map(key => [key, 0]));
    Object.values(rolloverSources || {}).forEach(source => {
      componentKeys.forEach(key => { totals[key] += Number(source?.[key]) || 0; });
    });
    return Object.fromEntries(componentKeys.map(key => [key, fromCents(totals[key])]));
  }

  function systemAdjustmentLabel(systemResult, hasCommissionAtSource) {
    const sourceKeys = Object.keys(systemResult?.systemSources || {});
    if (!sourceKeys.length || typeof hasCommissionAtSource !== 'function') return 'System';
    return sourceKeys.every(sourceKey => hasCommissionAtSource(sourceKey)) ? 'System Comm' : 'System';
  }

  window.BKPayoutSnapshots = {
    createSnapshot,
    fromCents,
    isPaid,
    isSnapshot,
    rolloversFromSources,
    systemAdjustment,
    systemAdjustmentLabel
  };
})();
