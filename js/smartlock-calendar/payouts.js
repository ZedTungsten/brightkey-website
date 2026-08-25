'use strict';

(function registerInstallerPayoutRules(root) {
  function normalizeSku(value) {
    let sku = String(value || '').trim();
    if (sku === 'Welding Baseplate Metal') sku = 'BASEPLATE-M';
    if (sku === 'Welding Baseplate Stainless') sku = 'BASEPLATE-S';
    return sku.toUpperCase();
  }

  function isEffective(rule, assignmentDate) {
    if (!rule?.effective_from || !assignmentDate) return true;
    const effectiveFrom = String(rule.effective_from);
    return effectiveFrom.includes('T')
      ? String(assignmentDate) >= effectiveFrom
      : String(assignmentDate).slice(0, 10) >= effectiveFrom.slice(0, 10);
  }

  function ruleKey(rule) {
    const assignment = String(rule?.assignment || '').toLowerCase();
    return `${assignment}:${assignment === 'service' ? normalizeSku(rule?.sku) : ''}`;
  }

  function latestEffectiveRule(rules, target, workDate) {
    const targetKey = ruleKey(target);
    return rules
      .filter(rule => ruleKey(rule) === targetKey && isEffective(rule, workDate))
      .sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')))[0] || null;
  }

  function creditRules(settings) {
    if (Array.isArray(settings.credit_rule_history) && settings.credit_rule_history.length) return settings.credit_rule_history;
    if (Array.isArray(settings.credit_rules) && settings.credit_rules.length) return settings.credit_rules;
    const effective = settings.ocular_repair_effective_from || null;
    return [
      { assignment: 'Lead', credit: settings.lead_credit ?? 1 },
      { assignment: 'Assist', credit: settings.assist_credit ?? 0.5 },
      { assignment: 'Service', sku: 'OCULAR', credit: settings.ocular_credit ?? 0, effective_from: effective },
      { assignment: 'Service', sku: 'REPAIR', credit: settings.repair_credit ?? 0, effective_from: effective },
      ...(settings.service_credit_rules || [])
    ];
  }

  function payoutRules(settings) {
    if (Array.isArray(settings.payout_rule_history) && settings.payout_rule_history.length) return settings.payout_rule_history;
    if (Array.isArray(settings.extra_payout_rules) && settings.extra_payout_rules.length) return settings.extra_payout_rules;
    const effective = settings.ocular_repair_effective_from || null;
    return [
      { assignment: 'Lead', amount: settings.lead_rate || 1000 },
      { assignment: 'Assist', amount: settings.assist_rate || 500 },
      { assignment: 'Service', sku: 'OCULAR', amount: settings.ocular_rate || 0, effective_from: effective },
      { assignment: 'Service', sku: 'REPAIR', amount: settings.repair_rate || 0, effective_from: effective },
      ...(settings.extra_services || []).map(rule => ({ ...rule, assignment: 'Service', amount: rule.amount ?? rule.rate }))
    ];
  }

  function assignmentFor(roles, skus) {
    const normalizedRoles = (roles || []).map(role => String(role).toLowerCase());
    const normalizedSkus = (skus || []).map(normalizeSku);
    if (normalizedRoles.includes('ocular') || normalizedSkus.includes('OCULAR')) return { assignment: 'Service', sku: 'OCULAR' };
    if (normalizedRoles.includes('repair') || normalizedSkus.includes('REPAIR')) return { assignment: 'Service', sku: 'REPAIR' };
    if (normalizedRoles.includes('lead')) return { assignment: 'Lead', sku: '' };
    if (normalizedRoles.includes('assist')) return { assignment: 'Assist', sku: '' };
    if (normalizedRoles.includes('service')) return { assignment: 'Service', sku: normalizedSkus[0] || '', skus: normalizedSkus };
    return { assignment: '', sku: '', skus: normalizedSkus };
  }

  root.BKInstallerPayoutRules = Object.freeze({
    serviceRules(settings = {}) {
      const skus = [...new Set(payoutRules(settings).filter(rule => String(rule.assignment).toLowerCase() === 'service').map(rule => normalizeSku(rule.sku)))];
      return skus.map(sku => latestEffectiveRule(payoutRules(settings), { assignment: 'Service', sku }, new Date().toISOString())).filter(Boolean).map(rule => ({ sku: normalizeSku(rule.sku), rate: Number(rule.amount ?? rule.rate ?? rule.value) || 0, effective_from: rule.effective_from || null }));
    },
    creditForJob(settings = {}, job = {}) {
      const target = assignmentFor(job.roles, job.skus);
      const ruleDate = job.assignmentDate || job.workDate;
      const candidates = target.assignment === 'Service'
        ? (target.skus || [target.sku]).map(sku => latestEffectiveRule(creditRules(settings), { assignment: 'Service', sku }, ruleDate)).filter(Boolean)
        : [latestEffectiveRule(creditRules(settings), target, ruleDate)].filter(Boolean);
      return Number(candidates[0]?.credit ?? candidates[0]?.value) || 0;
    },
    thresholdRateForJob(settings = {}, job = {}) {
      const target = assignmentFor(job.roles, job.skus);
      const ruleDate = job.assignmentDate || job.workDate;
      const candidates = target.assignment === 'Service'
        ? (target.skus || [target.sku]).map(sku => latestEffectiveRule(payoutRules(settings), { assignment: 'Service', sku }, ruleDate)).filter(Boolean)
        : [latestEffectiveRule(payoutRules(settings), target, ruleDate)].filter(Boolean);
      return Number(candidates[0]?.amount ?? candidates[0]?.rate ?? candidates[0]?.value) || 0;
    },
    servicePayoutsForJob(settings = {}, job = {}) {
      if (!(job.roles || []).some(role => String(role).toLowerCase() === 'service')) return [];
      const ruleDate = job.assignmentDate || job.workDate;
      return (job.skus || []).map(normalizeSku).map(sku => latestEffectiveRule(payoutRules(settings), { assignment: 'Service', sku }, ruleDate)).filter(Boolean).map(rule => ({ sku: normalizeSku(rule.sku), amount: Number(rule.amount ?? rule.rate ?? rule.value) || 0 }));
    },
    thresholdForDate(settings = {}, workDate) {
      const history = Array.isArray(settings.threshold_history) ? settings.threshold_history : [];
      const rule = history.filter(item => isEffective(item, workDate)).sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')))[0];
      return Number(rule?.value ?? settings.installations_before_crediting ?? 15) || 0;
    }
  });
})(globalThis);

function isOwnerInstaller() {
  return String(currentInstaller?.assignment || '').split(',').some(value => value.trim().toLowerCase() === 'owner');
}

function getInstallerPayoutCutoffBucket(dateValue, schedules) {
  const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  let year = Number(match[1]);
  let month = Number(match[2]);
  const day = Number(match[3]);
  const sorted = [...(schedules || [15, 30])].map(Number).filter(Boolean).sort((a, b) => a - b);
  if (!sorted.length) sorted.push(30);

  const cutoffDay = sorted.find(cutoff => day <= cutoff);
  if (cutoffDay) {
    return { monthKey: `${year}-${String(month).padStart(2, '0')}`, day: cutoffDay };
  }

  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return { monthKey: `${year}-${String(month).padStart(2, '0')}`, day: sorted[0] };
}

function getInstallerReimbursements(monthKey) {
  if (isOwnerInstaller()) return [];

  const record = (payoutTrackerData.payslipRecords || []).find(item => item.payout_month === monthKey);
  if (record) {
    const stored = Array.isArray(record.reimbursements_list) ? record.reimbursements_list : [];
    if (stored.length) {
      return stored.map(item => ({
        ...item,
        amount: Number(item.amount ?? item.value) || 0,
        date: String(item.date || `${monthKey}-01`).slice(0, 10),
        label: item.label || item.description || 'Reimbursement'
      }));
    }

    const legacy = (Array.isArray(record.adjustments_list) ? record.adjustments_list : [])
      .filter(item => String(item?.label || item?.description || '').toLowerCase().includes('reimbursement'))
      .map(item => ({
        ...item,
        amount: Number(item.amount ?? item.value) || 0,
        date: String(item.date || `${monthKey}-01`).slice(0, 10),
        label: item.label || item.description || 'Reimbursement'
      }));
    if (legacy.length) return legacy;

    const storedTotal = Number(record.reimbursements) || 0;
    if (storedTotal) {
      return [{
        amount: storedTotal,
        date: `${monthKey}-01`,
        label: 'Reimbursement',
        description: 'Employee reimbursement'
      }];
    }
  }

  return (payoutTrackerData.reimbursements || [])
    .filter(item => String(item.date || '').startsWith(monthKey))
    .map(item => ({
      ...item,
      amount: Number(item.amount ?? item.value) || 0,
      date: String(item.date || `${monthKey}-01`).slice(0, 10)
    }));
}

async function resolveInstallerReportingManager() {
  if (!currentInstaller?.id || !currentInstaller?.company_id || !sb) return '—';

  let managerId = currentInstaller.reporting_to || null;
  try {
    const { data: employee } = await sb
      .from('employees')
      .select('reporting_to')
      .eq('company_id', currentInstaller.company_id)
      .eq('id', currentInstaller.id)
      .maybeSingle();
    managerId = employee?.reporting_to || managerId;

    if (!managerId) {
      const { data: structureRow } = await sb
        .from('global_settings')
        .select('value')
        .eq('company_id', currentInstaller.company_id)
        .eq('key', 'company_structure')
        .maybeSingle();
      const departments = structureRow?.value?.departments || [];
      for (const department of departments) {
        const departmentHeadId = department.managerId || null;
        if (departmentHeadId === currentInstaller.id) break;
        for (const team of department.subteams || []) {
          const teamManagerId = team.managerId || null;
          if (teamManagerId === currentInstaller.id) {
            managerId = departmentHeadId;
            break;
          }
          if ((team.colleagueIds || []).includes(currentInstaller.id)) {
            managerId = teamManagerId || departmentHeadId;
            break;
          }
        }
        if (!managerId && (department.colleagueIds || []).includes(currentInstaller.id)) {
          managerId = departmentHeadId;
        }
        if (managerId) break;
      }
    }

    if (!managerId || managerId === currentInstaller.id) return '—';
    const { data: manager } = await sb
      .from('employees')
      .select('first_name, last_name')
      .eq('company_id', currentInstaller.company_id)
      .eq('id', managerId)
      .maybeSingle();
    return [manager?.first_name, manager?.last_name].filter(Boolean).join(' ') || '—';
  } catch (error) {
    console.error('Unable to resolve installer reporting manager:', error);
    return '—';
  }
}

function changePayoutMonth(direction) {
  const payoutInput = document.getElementById('payouts-month-select');
  if (!payoutInput) return;

  const currentValue = payoutInput.value || formatDateISO(new Date()).slice(0, 7);
  const [year, month] = currentValue.split('-').map(Number);
  const targetDate = new Date(year, month - 1 + direction, 1);
  payoutInput.value = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

  const label = document.getElementById('payouts-month-label');
  if (label) label.textContent = `${MONTH_NAMES[targetDate.getMonth()]} ${targetDate.getFullYear()}`;

  drawPayouts();
}

function renderSalaryAndAdjustments(monthKey) {
  const list = document.getElementById('payout-salary-list');
  const totalElement = document.getElementById('payout-salary-grand-total');
  if (!list || !totalElement || !currentInstaller) return;

  const config = payoutTrackerData.config || {};
  const schedules = [...(config.payoutSchedules || [15, 30])].map(Number).sort((a, b) => a - b);
  const monthState = payoutTrackerData.regularState?.[monthKey] || {};
  const specialState = payoutTrackerData.specialState?.[monthKey] || {};
  const rows = [];
  const salary = Number(currentInstaller.salary) || 0;
  const [year, month] = monthKey.split('-').map(Number);
  const selectedForProration = (payoutTrackerData.proratedState?.[monthKey] || []).includes(currentInstaller.id);
  const hiredDate = String(currentInstaller.date_hired || '').slice(0, 10);

  const salaryAllocation = (cutoffDay, cutoffIndex) => {
    const regularValue = salary / (schedules.length || 1);
    if (!selectedForProration || !hiredDate.startsWith(monthKey)) return regularValue;
    const hireDay = Number(hiredDate.slice(8, 10));
    const targetIndex = schedules.findIndex(day => day >= hireDay);
    if (targetIndex === -1 || cutoffIndex < targetIndex) return 0;
    if (cutoffIndex > targetIndex) return regularValue;

    const shiftValue = String(currentInstaller.shift_days || '').toLowerCase().replace(/\s+/g, '');
    let workdays = new Set([1, 2, 3, 4, 5]);
    if (shiftValue.includes('mon-sun')) workdays = new Set([0, 1, 2, 3, 4, 5, 6]);
    else if (shiftValue.includes('mon-sat')) workdays = new Set([1, 2, 3, 4, 5, 6]);
    else if (shiftValue === 'sun' || shiftValue === 'sunday') workdays = new Set([0]);
    const daysInMonth = new Date(year, month, 0).getDate();
    let totalWorkdays = 0;
    let eligibleWorkdays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      if (!workdays.has(new Date(year, month - 1, day).getDay())) continue;
      totalWorkdays++;
      if (day >= hireDay && day <= Math.min(cutoffDay, daysInMonth)) eligibleWorkdays++;
    }
    return totalWorkdays ? salary * (eligibleWorkdays / totalWorkdays) : 0;
  };

  const addRow = (label, amount, paid, day) => rows.push({ label, amount: Number(amount) || 0, paid: !!paid, day: Number(day) || 0 });
  schedules.forEach((day, index) => {
    addRow('Salary', salaryAllocation(day, index), monthState[`${currentInstaller.id}_${day}`], day);
  });

  const monthSpecialSchedules = window.BKSpecialPayoutHistory?.forMonth(config.specialSchedules || [], monthKey) || config.specialSchedules || [];
  (isOwnerInstaller() ? [] : monthSpecialSchedules.filter(item => item.employeeId === currentInstaller.id)).forEach(item => {
    addRow(item.label || `Special Payout — Day ${item.day}`, item.value, specialState[`${currentInstaller.id}_${Number(item.day)}`], item.day);
  });

  const itemPaidState = item => {
    if (item.paid) return true;
    const itemDay = new Date(`${item.date}T00:00:00`).getDate();
    const cutoff = schedules.find(day => itemDay <= day) || schedules[schedules.length - 1];
    return !!monthState[`${currentInstaller.id}_${cutoff}`];
  };
  getInstallerReimbursements(monthKey).forEach(item => addRow(item.label || 'Reimbursement', item.amount, itemPaidState(item), new Date(`${item.date}T00:00:00`).getDate()));
  (payoutTrackerData.adjustments || []).filter(item => String(item.date || '').startsWith(monthKey)).forEach(item => addRow(item.label || 'Adjustment', item.amount, itemPaidState(item), new Date(`${item.date}T00:00:00`).getDate()));

  const payoutModel = installerPayslipModel?.monthKey === monthKey ? installerPayslipModel : null;
  schedules.forEach(day => {
    const paid = !!monthState[`${currentInstaller.id}_${day}`];
    const serviceAmount = Number(payoutModel?.cutoffServicePayouts?.[day]) || 0;
    const rolloverAmount = Number(payoutModel?.cutoffRolloverPayouts?.[day]) || 0;
    const installationAmount = Number(payoutModel?.cutoffInstallationPayouts?.[day]) || 0;
    if (serviceAmount) addRow('Service Job', serviceAmount, paid, day);
    if (rolloverAmount) addRow('Rollover Install', rolloverAmount, paid, day);
    if (installationAmount) addRow('Installation Job', installationAmount, paid, day);
  });

  rows.sort((a, b) => a.day - b.day);

  const peso = value => `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const groupedRows = rows.reduce((groups, row) => {
    if (!groups.has(row.day)) groups.set(row.day, []);
    groups.get(row.day).push(row);
    return groups;
  }, new Map());
  list.innerHTML = groupedRows.size ? [...groupedRows.entries()].map(([day, dayRows]) => {
    const allPaid = dayRows.every(row => row.paid);
    return `
      <div style="display:flex; flex-direction:column; gap:0.45rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:1rem;">
          <div style="font-size:0.86rem; font-weight:800; color:var(--text-primary);">${MONTH_NAMES[month - 1]} ${day}</div>
          <span style="font-size:0.75rem; font-weight:700; color:${allPaid ? 'var(--success)' : 'var(--text-muted)'};">${allPaid ? 'Paid' : 'Unpaid'}</span>
        </div>
        ${dayRows.map(row => `
          <div style="display:grid; grid-template-columns:minmax(0,1fr) auto; gap:1rem; align-items:baseline; padding-left:0.45rem;">
            <span style="font-size:0.8rem; color:var(--text-secondary);">-${escapeHtml(row.label)}</span>
            <span style="font-size:0.8rem; color:var(--text-secondary); font-variant-numeric:tabular-nums;">${peso(row.amount)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }).join('') : '<div style="color:var(--text-muted); font-size:0.82rem;">No salary or adjustment entries for this month.</div>';
  const supplementalLabels = new Set(['Service Job', 'Rollover Install', 'Installation Job']);
  const salaryAndAdjustmentsTotal = rows.reduce((sum, row) => sum + (supplementalLabels.has(row.label) ? 0 : row.amount), 0);
  const itemizedTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  totalElement.textContent = peso(itemizedTotal);
  totalElement.dataset.total = String(salaryAndAdjustmentsTotal);
}

function getReadyPayslipRecord(monthKey) {
  const record = (payoutTrackerData.payslipRecords || []).find(item => item.payout_month === monthKey);
  if (!record || !currentInstaller) return null;
  const schedules = payoutTrackerData.config?.payoutSchedules || [15, 30];
  const regularState = payoutTrackerData.regularState?.[monthKey] || {};
  const allSalaryPaid = schedules.every(day => regularState[`${currentInstaller.id}_${Number(day)}`] === true);
  const configuredSpecials = payoutTrackerData.config?.specialSchedules || [];
  const monthSpecials = window.BKSpecialPayoutHistory?.forMonth(configuredSpecials, monthKey) || configuredSpecials;
  const employeeSpecials = isOwnerInstaller() ? [] : monthSpecials.filter(item => item.employeeId === currentInstaller.id);
  const specialState = payoutTrackerData.specialState?.[monthKey] || {};
  const allSpecialsPaid = employeeSpecials.every(item => specialState[`${currentInstaller.id}_${Number(item.day)}`] === true);
  return allSalaryPaid && allSpecialsPaid ? record : null;
}

function updateInstallerPayslipState(monthKey) {
  const button = document.getElementById('btn-download-installer-payslip');
  const status = document.getElementById('installer-payslip-status');
  if (!button || !status) return;
  const ready = !!getReadyPayslipRecord(monthKey);
  button.disabled = !ready;
  button.style.background = ready ? 'var(--cyan)' : '#d1d5db';
  button.style.color = ready ? '#fff' : '#6b7280';
  button.style.cursor = ready ? 'pointer' : 'not-allowed';
  status.textContent = ready ? 'Ready' : 'Not yet ready';
  status.style.color = ready ? 'var(--success)' : 'var(--text-muted)';
}

async function downloadInstallerPayslip() {
  const monthKey = document.getElementById('payouts-month-select')?.value;
  const record = getReadyPayslipRecord(monthKey);
  if (!record || typeof html2pdf !== 'function') return;
  const [year, month] = monthKey.split('-').map(Number);
  const monthText = `${MONTH_NAMES[month - 1]} ${year}`;
  const profile = payoutTrackerData.companyProfile || {};
  const template = payoutTrackerData.payslipConfig || {};
  const renderer = window.BKPayslipRenderer;
  if (!renderer?.createSheet) {
    if (typeof showToast === 'function') {
      showToast('The payslip generator could not be loaded. Refresh the page and try again.', true);
    } else {
      console.error('Payslip renderer is unavailable.');
    }
    return;
  }
  const row = renderer.createBreakdownRow || ((type, description, amount) => {
    const pesoValue = `₱${(Number(amount) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `<tr><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;font-weight:600;vertical-align:top;">${escapeHtml(type)}</td><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;color:#4b5563;line-height:1.5;vertical-align:top;">${escapeHtml(description)}</td><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;width:120px;vertical-align:top;">${pesoValue}</td></tr>`;
  });
  const configuredSpecials = payoutTrackerData.config?.specialSchedules || [];
  const monthSpecials = window.BKSpecialPayoutHistory?.forMonth(configuredSpecials, monthKey) || configuredSpecials;
  const specialSchedules = isOwnerInstaller() ? [] : monthSpecials.filter(item => item.employeeId === currentInstaller.id);
  const adjustments = (payoutTrackerData.adjustments || []).filter(item => String(item.date || '').startsWith(monthKey));
  const reimbursements = getInstallerReimbursements(monthKey);
  const liveModel = installerPayslipModel?.monthKey === monthKey ? installerPayslipModel : {};
  const thresholdEarnings = isOwnerInstaller() ? 0 : Number(liveModel.thresholdEarnings ?? document.getElementById('payout-extra-total')?.dataset.total) || 0;
  const serviceEarnings = isOwnerInstaller() ? 0 : Number(liveModel.serviceEarnings ?? document.getElementById('payout-services-total')?.dataset.total) || 0;
  const salaryAndAdjustmentsTotal = Number(document.getElementById('payout-salary-grand-total')?.dataset.total) || 0;
  const totalPayout = salaryAndAdjustmentsTotal + thresholdEarnings + serviceEarnings;
  const supplementalTotal = [...specialSchedules, ...adjustments, ...reimbursements].reduce((sum, item) => sum + (Number(item.value ?? item.amount) || 0), 0);
  const liveSalaryPaid = salaryAndAdjustmentsTotal - supplementalTotal;
  let rows = row(liveSalaryPaid !== Number(record.salary) ? 'Prorated Salary' : 'Basic Salary', liveSalaryPaid !== Number(record.salary) ? 'Based on eligible scheduled workdays' : 'Monthly Basic Salary', liveSalaryPaid);
  if (thresholdEarnings) rows += row('Earnings Past Threshold', liveModel.thresholdDescription || 'Extra installation credits above threshold', thresholdEarnings);
  if (serviceEarnings) rows += row('Service Job Earnings', liveModel.serviceDescription || 'Extra paid service jobs', serviceEarnings);
  if (Number(record.commissions)) rows += row('Commissions', 'Sales Commissions', record.commissions);
  if (adjustments.length) {
    const shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const labels = adjustments.map(item => {
      const date = new Date(`${item.date}T00:00:00`);
      const suffix = !isNaN(date.getTime()) ? ` (${shortMonths[date.getMonth()]} ${date.getDate()})` : '';
      return `${escapeHtml(item.label || item.description || 'Adjustment')}${suffix}`;
    }).join('<br>');
    const amounts = adjustments.map(item => renderer.peso(item.value ?? item.amount)).join('<br>');
    rows += `<tr><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;font-weight:600;vertical-align:top;">Adjustments</td><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;color:#4b5563;vertical-align:top;line-height:1.5;">${labels}</td><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;vertical-align:top;line-height:1.5;width:120px;">${amounts}</td></tr>`;
  }
  if (specialSchedules.length) {
    const labels = specialSchedules.map(item => `${escapeHtml(item.label || 'Special Payout')} (Day ${Number(item.day) || 1})`).join('<br>');
    const amounts = specialSchedules.map(item => renderer.peso(item.value)).join('<br>');
    rows += `<tr><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;font-weight:600;vertical-align:top;">Special Payouts</td><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;color:#4b5563;vertical-align:top;line-height:1.5;">${labels}</td><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;vertical-align:top;line-height:1.5;width:120px;">${amounts}</td></tr>`;
  }
  const reimbursementTotal = reimbursements.reduce((sum, item) => sum + (Number(item.value ?? item.amount) || 0), 0);
  if (reimbursementTotal) rows += row('GL Reimbursement', 'Employee reimbursement from the general ledger', reimbursementTotal);

  const schedules = [...(payoutTrackerData.config?.payoutSchedules || [15, 30])].map(Number).sort((a, b) => a - b);
  const cutoffValues = schedules.map(() => liveSalaryPaid / (schedules.length || 1));
  const cutoffIndexForDay = day => {
    const index = schedules.findIndex(cutoff => Number(day) <= cutoff);
    return index === -1 ? schedules.length - 1 : index;
  };
  adjustments.forEach(item => {
    const itemDay = item.date ? new Date(item.date).getUTCDate() : schedules[schedules.length - 1];
    cutoffValues[cutoffIndexForDay(itemDay)] += Number(item.value ?? item.amount) || 0;
  });
  reimbursements.forEach(item => {
    const itemDay = item.date ? new Date(item.date).getUTCDate() : schedules[schedules.length - 1];
    cutoffValues[cutoffIndexForDay(itemDay)] += Number(item.value ?? item.amount) || 0;
  });
  schedules.forEach((day, index) => {
    cutoffValues[index] += Number(liveModel.cutoffPayouts?.[day]) || 0;
  });
  if (Number(record.commissions)) cutoffValues[cutoffValues.length - 1] += Number(record.commissions);

  const scheduleRows = schedules.map((day, index) => ({
    day,
    order: 1,
    label: `Cutoff Payout (Day ${day})`,
    value: cutoffValues[index]
  }));
  const specialByDay = new Map();
  specialSchedules.forEach(item => {
    const day = Number(item.day) || 1;
    specialByDay.set(day, (specialByDay.get(day) || 0) + (Number(item.value) || 0));
  });
  specialByDay.forEach((value, day) => {
    scheduleRows.push({ day, order: 0, label: `Special Payout (Day ${day})`, value });
  });
  const logoUrl = template.logoStyle === 'dark' ? profile.logoDark : profile.logoLight;
  const employeeName = [currentInstaller.first_name, currentInstaller.last_name].filter(Boolean).join(' ');
  const reportingTo = await resolveInstallerReportingManager();
  const sheet = renderer.createSheet({
    profile,
    template,
    logoUrl,
    monthText,
    employeeName,
    department: record.department || currentInstaller.department || '—',
    reportingTo,
    position: record.position || currentInstaller.title || '—',
    breakdownRowsHtml: rows,
    scheduleRows,
    totalPayout
  });
  const button = document.getElementById('btn-download-installer-payslip');
  button.disabled = true;
  try {
    await renderer.downloadSheet(
      sheet,
      `Payslip_${employeeName.replace(/\s+/g, '_')}_${monthText.replace(/\s+/g, '_')}.pdf`
    );
  } finally {
    updateInstallerPayslipState(monthKey);
  }
}

function drawPayouts() {
  if (!currentInstaller) return;
  const select = document.getElementById('payouts-month-select');
  if (!select) return;
  
  const targetMonthKey = select.value;
  const myId = currentInstaller.id;
  const isOwner = isOwnerInstaller();
  renderSalaryAndAdjustments(targetMonthKey);
  updateInstallerPayslipState(targetMonthKey);

  // Get configuration settings
  const config = installerPayoutSettings || {
    installations_before_crediting: 15,
    lead_credit: 1.0,
    assist_credit: 0.5,
    lead_rate: 1000,
    assist_rate: 500,
    extra_services: [
      { sku: 'BASEPLATE-M', rate: 700 },
      { sku: 'BASEPLATE-S', rate: 700 }
    ]
  };

  const thresholdVal = config.installations_before_crediting || 15;
  const ocularWeight = config.ocular_credit !== undefined ? config.ocular_credit : 0;
  const repairWeight = config.repair_credit !== undefined ? config.repair_credit : 0;
  const ocularRateVal = config.ocular_rate || 0;
  const repairRateVal = config.repair_rate || 0;
  const payoutSchedules = [...(payoutTrackerData.config?.payoutSchedules || [15, 30])]
    .map(Number)
    .filter(Boolean)
    .sort((a, b) => a - b);
  const extraServicesList = window.BKInstallerPayoutRules.serviceRules(config);

  // Update threshold settings labels in UI

  // Keep all Done work available so threshold eligibility can be calculated in
  // its installation month before a post-cutoff payout is carried forward.
  const eligibleBookings = dbBookings.filter(b => {
    if (!b.scheduled_date) return false;
    if (String(b.status || '').toLowerCase() === 'cancelled') return false;
    return true;
  });

  const doorJobs = [];
  eligibleBookings.forEach(b => {
    const assignmentSkus = String(b.product_skus || '')
      .split('|')
      .map((sku) => sku.trim().toLowerCase())
      .filter(Boolean);
    const orderNo = String(b.order_no || '').toUpperCase();
    const isDayOff = assignmentSkus.includes('day off') || orderNo.startsWith('DO-');
    const isBackjob = assignmentSkus.includes('backjob') || orderNo.startsWith('BJ-');
    const isOcular = assignmentSkus.includes('ocular');
    const isRepair = assignmentSkus.includes('repair');
    if (isDayOff || isBackjob) return;

    const assignedDoors = getInstallerAssignedDoorsForBooking(b, myId);
    assignedDoors.forEach(d => {
      if (d.completed) {
        doorJobs.push({
          completed_at: d.completed_at || b.updated_at || b.created_at || b.scheduled_date,
          roles: isOcular ? ['ocular'] : isRepair ? ['repair'] : d.roles,
          skus: d.skus,
          scheduled_date: b.scheduled_date,
          assignmentDate: d.assigned_at || b.created_at || b.scheduled_date
        });
      }
    });
  });

  // Sort doorJobs chronologically by scheduled_date
  doorJobs.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  let leadCredit = 0;
  let assistCredit = 0;
  let creditedServiceCredit = 0;
  let serviceEarnings = 0;
  const serviceCounts = {};

  let completedMonthCredit = 0;
  const settledCreditBySourceMonth = {};
  doorJobs.forEach(job => {
    const sourceMonth = String(job.scheduled_date || '').slice(0, 7);
    if (!sourceMonth) return;
    const payoutBucket = getInstallerPayoutCutoffBucket(job.scheduled_date, payoutSchedules);
    if (payoutBucket?.monthKey !== sourceMonth) return;
    const weight = window.BKInstallerPayoutRules.creditForJob(config, { roles: job.roles, skus: job.skus, assignmentDate: job.assignmentDate, workDate: job.scheduled_date });
    settledCreditBySourceMonth[sourceMonth] = (settledCreditBySourceMonth[sourceMonth] || 0) + weight;
  });

  let creditRollover = 0;
  const creditRolloverByMonth = {};
  doorJobs.forEach(job => {
    const sourceMonth = String(job.scheduled_date || '').slice(0, 7);
    const payoutBucket = getInstallerPayoutCutoffBucket(job.scheduled_date, payoutSchedules);
    const threshold = window.BKInstallerPayoutRules.thresholdForDate(config, job.scheduled_date);
    if (!sourceMonth || sourceMonth === targetMonthKey || payoutBucket?.monthKey !== targetMonthKey || (settledCreditBySourceMonth[sourceMonth] || 0) >= threshold) return;
    const weight = window.BKInstallerPayoutRules.creditForJob(config, { roles: job.roles, skus: job.skus, assignmentDate: job.assignmentDate, workDate: job.scheduled_date });
    creditRollover += weight;
    creditRolloverByMonth[sourceMonth] = (creditRolloverByMonth[sourceMonth] || 0) + weight;
  });

  const runningCreditBySourceMonth = {};
  let payoutEligibleExtraCredit = 0;
  let thresholdEarnings = 0;
  const thresholdRolloverByMonth = {};
  const cutoffPayouts = {};
  const cutoffServicePayouts = {};
  const cutoffRolloverPayouts = {};
  const cutoffInstallationPayouts = {};
  payoutSchedules.forEach(day => { cutoffPayouts[day] = 0; });
  payoutSchedules.forEach(day => {
    cutoffServicePayouts[day] = 0;
    cutoffRolloverPayouts[day] = 0;
    cutoffInstallationPayouts[day] = 0;
  });

  doorJobs.forEach(job => {
    const ruleJob = { roles: job.roles, skus: job.skus, assignmentDate: job.assignmentDate, workDate: job.scheduled_date };
    const weight = window.BKInstallerPayoutRules.creditForJob(config, ruleJob);
    const jobRate = window.BKInstallerPayoutRules.thresholdRateForJob(config, ruleJob);

    const sourceMonth = String(job.scheduled_date || '').slice(0, 7);
    if (!sourceMonth) return;
    const previousCredit = sourceMonth === targetMonthKey
      ? (runningCreditBySourceMonth[sourceMonth] || creditRollover)
      : (runningCreditBySourceMonth[sourceMonth] || 0);
    const newCredit = previousCredit + weight;
    const jobThreshold = window.BKInstallerPayoutRules.thresholdForDate(config, job.scheduled_date);
    const sourceReachedThreshold = sourceMonth === targetMonthKey || (settledCreditBySourceMonth[sourceMonth] || 0) >= jobThreshold;
    const thresholdPayForJob = !isOwner && sourceReachedThreshold && newCredit > jobThreshold ? jobRate : 0;
    runningCreditBySourceMonth[sourceMonth] = newCredit;

    // Completion progress belongs to the scheduled installation month.
    if (sourceMonth === targetMonthKey) {
      completedMonthCredit += weight;
      if (job.roles.includes('lead')) leadCredit += weight;
      else if (job.roles.includes('assist')) assistCredit += weight;
      else if (weight > 0) creditedServiceCredit += weight;
    }

    // Money follows the cutoff bucket. For example, a Done July 31 job remains
    // a July completion but appears in the first August payout.
    const payoutBucket = getInstallerPayoutCutoffBucket(job.scheduled_date, payoutSchedules);
    if (!payoutBucket || payoutBucket.monthKey !== targetMonthKey) return;

    thresholdEarnings += thresholdPayForJob;
    if (thresholdPayForJob > 0) {
      payoutEligibleExtraCredit += weight;
      if (sourceMonth !== targetMonthKey) {
        const rollover = thresholdRolloverByMonth[sourceMonth] || { credit: 0, amount: 0 };
        rollover.credit += weight;
        rollover.amount += thresholdPayForJob;
        thresholdRolloverByMonth[sourceMonth] = rollover;
      }
    }

    let servicePayForJob = 0;
    if (!isOwner) window.BKInstallerPayoutRules.servicePayoutsForJob(config, ruleJob).forEach(service => {
      serviceCounts[service.sku] = (serviceCounts[service.sku] || 0) + 1;
      serviceEarnings += service.amount;
      servicePayForJob += service.amount;
    });
    cutoffPayouts[payoutBucket.day] = (cutoffPayouts[payoutBucket.day] || 0) + thresholdPayForJob + servicePayForJob;
    cutoffServicePayouts[payoutBucket.day] = (cutoffServicePayouts[payoutBucket.day] || 0) + servicePayForJob;
    if (sourceMonth !== targetMonthKey) {
      cutoffRolloverPayouts[payoutBucket.day] = (cutoffRolloverPayouts[payoutBucket.day] || 0) + thresholdPayForJob;
    } else {
      cutoffInstallationPayouts[payoutBucket.day] = (cutoffInstallationPayouts[payoutBucket.day] || 0) + thresholdPayForJob;
    }
  });

  const totalCredit = completedMonthCredit + creditRollover;
  
  // Update Threshold Progress
  const thresholdSummary = `${totalCredit.toFixed(1)} / ${thresholdVal}`;
  document.getElementById('payout-threshold-summary').textContent = thresholdSummary;
  document.getElementById('payout-lead-count').textContent = leadCredit.toFixed(1);
  document.getElementById('payout-assist-count').textContent = assistCredit.toFixed(1);
  document.getElementById('payout-credited-service-count').textContent = creditedServiceCredit.toFixed(1);

  // Render gamified progress bar
  const percent = Math.min(100, Math.max(0, (totalCredit / thresholdVal) * 100));
  const fillEl = document.getElementById('payout-threshold-fill');
  const percentEl = document.getElementById('payout-threshold-percent');
  if (fillEl) fillEl.style.width = `${percent}%`;
  if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;

  // 2. Calculate threshold earnings (extra works past threshold)
  let thresholdEarningsDetailsHtml = '';
  let earningsCalculationText = '';

  if (thresholdEarnings > 0) {
    const rolloverEntries = Object.entries(thresholdRolloverByMonth).sort(([a], [b]) => a.localeCompare(b));
    const rolloverCreditTotal = rolloverEntries.reduce((sum, [, rollover]) => sum + rollover.credit, 0);
    const rolloverAmountTotal = rolloverEntries.reduce((sum, [, rollover]) => sum + rollover.amount, 0);
    const currentExtraCredit = payoutEligibleExtraCredit - rolloverCreditTotal;
    const currentExtraAmount = thresholdEarnings - rolloverAmountTotal;
    const calculationAmounts = [];
    let currentMonthDetailsHtml = '';
    if (currentExtraAmount > 0) {
      calculationAmounts.push(currentExtraAmount);
      currentMonthDetailsHtml = `
        <div style="display:flex; justify-content:space-between;">
          <span>This month:</span>
          <span>+${currentExtraCredit.toFixed(1)} cr = ₱${currentExtraAmount.toLocaleString()}</span>
        </div>
      `;
    }
    const rolloverDetailsHtml = rolloverEntries.map(([monthKey, rollover]) => {
      const [year, month] = monthKey.split('-').map(Number);
      const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long' });
      calculationAmounts.push(rollover.amount);
      return `
        <div style="display:flex; justify-content:space-between;">
          <span>Rollover from ${escapeHtml(monthLabel)}:</span>
          <span>+${rollover.credit.toFixed(1)} cr = ₱${rollover.amount.toLocaleString()}</span>
        </div>
      `;
    }).join('');
    earningsCalculationText = `${calculationAmounts.map(amount => `₱${amount.toLocaleString()}`).join(' + ')} = ₱${thresholdEarnings.toLocaleString()}`;
    thresholdEarningsDetailsHtml = `
      ${currentMonthDetailsHtml}
      ${rolloverDetailsHtml}
    `;
  } else {
    thresholdEarningsDetailsHtml = `<div style="font-style:italic; color:var(--text-muted); font-size:0.8rem;">No threshold earnings are payable in this month's cutoff buckets.</div>`;
  }

  const creditRolloverDetailsHtml = Object.entries(creditRolloverByMonth).sort(([a], [b]) => a.localeCompare(b)).map(([monthKey, credit]) => {
    const [year, month] = monthKey.split('-').map(Number);
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long' });
    return `
      <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-secondary);">
        <span>Credit rollover from ${escapeHtml(monthLabel)}:</span>
        <span>+${credit.toFixed(1)} cr (not yet payable)</span>
      </div>
    `;
  }).join('');
  thresholdEarningsDetailsHtml = creditRolloverDetailsHtml + thresholdEarningsDetailsHtml;

  const peso = value => `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('payout-extra-total').textContent = peso(thresholdEarnings);
  document.getElementById('payout-extra-total').dataset.total = String(thresholdEarnings);
  document.getElementById('payout-extra-details').innerHTML = thresholdEarningsDetailsHtml;

  // 3. Render flat services payout
  let servicesDetailsHtml = '';
  if (Object.keys(serviceCounts).length > 0) {
    Object.entries(serviceCounts).forEach(([sku, count]) => {
      const matched = extraServicesList.find(es => es.sku === sku);
      const rate = matched ? matched.rate : 0;
      const subtotal = count * rate;
      servicesDetailsHtml += `
        <div style="display:flex; justify-content:space-between;">
          <span>${escapeHtml(sku)} (${count}):</span>
          <span>₱${subtotal.toLocaleString()}</span>
        </div>
      `;
    });
  } else {
    servicesDetailsHtml = `<div style="font-style:italic; color:var(--text-muted); font-size:0.8rem;">No extra paid services recorded this month.</div>`;
  }

  document.getElementById('payout-services-total').textContent = peso(serviceEarnings);
  document.getElementById('payout-services-total').dataset.total = String(serviceEarnings);
  document.getElementById('payout-services-details').innerHTML = servicesDetailsHtml;

  const serviceDescription = Object.entries(serviceCounts).map(([sku]) => {
    const matched = extraServicesList.find(item => item.sku === sku);
    return `₱${Number(matched?.rate || 0).toLocaleString()} per ${sku}`;
  }).join('\n');
  installerPayslipModel = {
    monthKey: targetMonthKey,
    thresholdEarnings,
    thresholdDescription: thresholdEarnings > 0
      ? earningsCalculationText
      : `Threshold of ${thresholdVal} counts not reached`,
    serviceEarnings,
    serviceDescription: serviceDescription || 'No extra paid services recorded',
    cutoffPayouts,
    cutoffServicePayouts,
    cutoffRolloverPayouts,
    cutoffInstallationPayouts
  };
  renderSalaryAndAdjustments(targetMonthKey);

  // 4. Grand Total
  const grandTotal = thresholdEarnings + serviceEarnings;
  document.getElementById('payout-grand-total').textContent = peso(grandTotal);
  const salaryTotal = Number(document.getElementById('payout-salary-grand-total')?.dataset.total) || 0;
  const overallTotal = document.getElementById('payout-overall-grand-total');
  if (overallTotal) overallTotal.textContent = peso(salaryTotal + grandTotal);
}
