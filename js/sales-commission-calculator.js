(function () {
  'use strict';

  const basis = booking => {
    const snapshot = booking?.commission_basis_snapshot;
    return snapshot && typeof snapshot === 'object' ? { ...booking, ...snapshot } : booking;
  };

  const eligible = (product, rules) => (rules || []).some(rule => {
    if (rule.scope === 'tags') return Array.isArray(product.tags) && product.tags.includes(rule.tag);
    if (rule.scope !== 'businesses') return false;
    if (rule.business === 'all') return true;
    if (rule.business !== product.business) return false;
    if (rule.category === 'all') return true;
    if (rule.category !== product.category) return false;
    return rule.sku === 'all' || rule.sku === product.sku;
  });

  function skuAdjustment(booking, sku, rateLabel, productMap, rules) {
    const b = basis(booking);
    const bookingDate = String(b?.scheduled_date || '').slice(0, 10);
    if (!bookingDate) return 0;
    const normalizedSku = String(sku || '').trim().toLowerCase();
    const product = productMap[normalizedSku] || {};
    return (rules || []).reduce((total, rule) => {
      if (bookingDate < (rule.start_date || '1970-01-01') || bookingDate > (rule.end_date || '9999-12-31')) return total;
      if (!rule.label || rule.label.trim().toLowerCase() !== String(rateLabel || '').trim().toLowerCase()) return total;
      let matches = false;
      if (rule.scope === 'businesses') {
        const skuMatch = !rule.sku || rule.sku === 'all' || normalizedSku === rule.sku.toLowerCase();
        const categoryMatch = !rule.category || rule.category === 'all' || String(product.category || '').toLowerCase() === rule.category.toLowerCase();
        const businessMatch = !rule.business || rule.business === 'all' || String(product.business || '').toLowerCase() === rule.business.toLowerCase();
        matches = skuMatch && categoryMatch && businessMatch;
      } else if (rule.scope === 'tags') {
        matches = Array.isArray(product.tags) && product.tags.map(tag => tag.toLowerCase()).includes(String(rule.tag || '').toLowerCase());
      }
      if (!matches) return total;
      const value = Math.abs(parseFloat(rule.value) || 0);
      return total + (rule.operator === 'minus' ? -value : value);
    }, 0);
  }

  function bookingEligibleCentavos(booking, productMap, rules) {
    const b = basis(booking);
    const skus = String(b?.product_skus || '').split(' | ').map(value => value.trim());
    const quantities = String(b?.product_qtys || '').split(' | ').map(value => value.trim());
    const prices = String(b?.product_unit_prices || '').split(' | ').map(value => value.trim());
    let total = 0;
    skus.forEach((sku, index) => {
      if (!sku) return;
      const product = productMap[sku.toLowerCase()] || { sku, business: '', category: '', tags: [] };
      if (!eligible(product, rules)) return;
      total += Math.round((parseFloat(prices[index]) || 0) * (parseInt(quantities[index], 10) || 1) * 100);
    });
    let deposit = Math.round(Math.abs(parseInt(b?.deposit_amount, 10) || 0));
    let deductions = deposit;
    const deductionLabels = String(b?.deduction_labels || '').split('|').map(value => value.trim().toLowerCase());
    const deductionValues = String(b?.deduction_values || '').split('|').map(value => value.trim());
    deductionLabels.forEach((label, index) => {
      if (!label) return;
      const value = Math.round(Math.abs(parseFloat(deductionValues[index]) || 0) * 100);
      deductions += value;
      if (label.includes('deposit')) deposit += value;
    });
    return Math.max(0, total - deductions + deposit);
  }

  function bookingAdjustment(booking, rateLabel, productMap, adjustmentRules, eligibilityRules) {
    const b = basis(booking);
    const skus = String(b?.product_skus || '').split(' | ').map(value => value.trim());
    const quantities = String(b?.product_qtys || '').split(' | ').map(value => value.trim());
    const prices = String(b?.product_unit_prices || '').split(' | ').map(value => value.trim());
    let eligibleTotal = 0;
    let weightedTotal = 0;
    skus.forEach((sku, index) => {
      if (!sku) return;
      const product = productMap[sku.toLowerCase()] || { sku, business: '', category: '', tags: [] };
      if (!eligible(product, eligibilityRules)) return;
      const lineTotal = Math.round((parseFloat(prices[index]) || 0) * (parseInt(quantities[index], 10) || 1) * 100);
      eligibleTotal += lineTotal;
      weightedTotal += lineTotal * skuAdjustment(b, sku, rateLabel, productMap, adjustmentRules);
    });
    return eligibleTotal > 0 ? weightedTotal / eligibleTotal : 0;
  }

  function amountsByEmployee({ assignments, bookings, products, config }) {
    const productMap = Object.fromEntries((products || []).filter(product => product.sku).map(product => [product.sku.toLowerCase(), product]));
    const bookingMap = new Map((bookings || []).map(booking => [booking.id, booking]));
    const grouped = new Map();
    (assignments || []).filter(row => row.employee_id).forEach(row => {
      const key = `${row.booking_id}|${row.sku}|${row.product_index}|${row.rate_label}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    });
    const totals = new Map();
    grouped.forEach(rows => {
      const row = rows[0];
      const booking = bookingMap.get(row.booking_id);
      if (!booking) return;
      const rate = (config?.rates || []).find(item => item.label === row.rate_label);
      const adjustment = bookingAdjustment(booking, row.rate_label, productMap, config?.adjustment_rules, config?.eligibility_rules);
      const percentage = (parseFloat(rate?.value) || 0) + adjustment;
      let amountBase = bookingEligibleCentavos(booking, productMap, config?.eligibility_rules);
      if (row.sku !== 'ORDER_TOTAL') {
        const b = basis(booking);
        const skus = String(b?.product_skus || '').split(' | ').map(value => value.trim());
        const quantities = String(b?.product_qtys || '').split(' | ').map(value => value.trim());
        const prices = String(b?.product_unit_prices || '').split(' | ').map(value => value.trim());
        const product = productMap[String(row.sku || '').toLowerCase()] || { sku: row.sku, business: '', category: '', tags: [] };
        amountBase = eligible(product, config?.eligibility_rules)
          ? Math.round((parseFloat(prices[row.product_index]) || 0) * (parseInt(quantities[row.product_index], 10) || 1) * 100)
          : 0;
      }
      const perEmployee = Math.round(amountBase * ((percentage / rows.length) / 100));
      rows.forEach(item => totals.set(item.employee_id, (totals.get(item.employee_id) || 0) + perEmployee));
    });
    return totals;
  }

  window.BKSalesCommissionCalculator = { amountsByEmployee };
})();
