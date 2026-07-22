'use strict';

function isOwnerInstaller() {
  return String(currentInstaller?.assignment || '').split(',').some(value => value.trim().toLowerCase() === 'owner');
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
    addRow(`Salary Cutoff — ${MONTH_NAMES[month - 1]} ${day}`, salaryAllocation(day, index), monthState[`${currentInstaller.id}_${day}`], day);
  });

  (isOwnerInstaller() ? [] : (config.specialSchedules || []).filter(item => item.employeeId === currentInstaller.id)).forEach(item => {
    addRow(item.label || `Special Payout — Day ${item.day}`, item.value, specialState[`${currentInstaller.id}_${Number(item.day)}`], item.day);
  });

  const itemPaidState = item => {
    if (item.paid) return true;
    const itemDay = new Date(`${item.date}T00:00:00`).getDate();
    const cutoff = schedules.find(day => itemDay <= day) || schedules[schedules.length - 1];
    return !!monthState[`${currentInstaller.id}_${cutoff}`];
  };
  (isOwnerInstaller() ? [] : (payoutTrackerData.reimbursements || []).filter(item => String(item.date || '').startsWith(monthKey))).forEach(item => addRow(item.label || 'Reimbursement', item.amount, itemPaidState(item), new Date(`${item.date}T00:00:00`).getDate()));
  (payoutTrackerData.adjustments || []).filter(item => String(item.date || '').startsWith(monthKey)).forEach(item => addRow(item.label || 'Adjustment', item.amount, itemPaidState(item), new Date(`${item.date}T00:00:00`).getDate()));

  rows.sort((a, b) => a.day - b.day);

  const peso = value => `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  list.innerHTML = rows.length ? rows.map(row => `
    <div style="display:grid; grid-template-columns:minmax(0,1fr) auto; gap:1rem; align-items:center;">
      <div style="min-width:0;">
        <div style="font-size:0.84rem; font-weight:700; color:var(--text-primary);">${escapeHtml(row.label)}</div>
        <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.15rem;">${peso(row.amount)}</div>
      </div>
      <span style="font-size:0.75rem; font-weight:700; color:${row.paid ? 'var(--success)' : 'var(--text-muted)'};">${row.paid ? 'Paid' : 'Unpaid'}</span>
    </div>
  `).join('') : '<div style="color:var(--text-muted); font-size:0.82rem;">No salary or adjustment entries for this month.</div>';
  const salaryAndAdjustmentsTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  totalElement.textContent = peso(salaryAndAdjustmentsTotal);
  totalElement.dataset.total = String(salaryAndAdjustmentsTotal);
}

function getReadyPayslipRecord(monthKey) {
  const record = (payoutTrackerData.payslipRecords || []).find(item => item.payout_month === monthKey);
  if (!record || !currentInstaller) return null;
  const schedules = payoutTrackerData.config?.payoutSchedules || [15, 30];
  const regularState = payoutTrackerData.regularState?.[monthKey] || {};
  const allSalaryPaid = schedules.every(day => regularState[`${currentInstaller.id}_${Number(day)}`] === true);
  const employeeSpecials = isOwnerInstaller() ? [] : (payoutTrackerData.config?.specialSchedules || []).filter(item => item.employeeId === currentInstaller.id);
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
  const peso = value => `₱${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const row = (type, description, amount) => `<tr><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;font-weight:600;vertical-align:top;">${escapeHtml(type)}</td><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;color:#4b5563;line-height:1.5;vertical-align:top;">${escapeHtml(description)}</td><td style="padding:0.75rem;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;width:120px;vertical-align:top;">${peso(amount)}</td></tr>`;
  const specialSchedules = isOwnerInstaller() ? [] : (payoutTrackerData.config?.specialSchedules || []).filter(item => item.employeeId === currentInstaller.id);
  const adjustments = (payoutTrackerData.adjustments || []).filter(item => String(item.date || '').startsWith(monthKey));
  const reimbursements = isOwnerInstaller() ? [] : (payoutTrackerData.reimbursements || []).filter(item => String(item.date || '').startsWith(monthKey));
  const thresholdEarnings = isOwnerInstaller() ? 0 : Number(document.getElementById('payout-extra-total')?.dataset.total) || 0;
  const serviceEarnings = isOwnerInstaller() ? 0 : Number(document.getElementById('payout-services-total')?.dataset.total) || 0;
  const salaryAndAdjustmentsTotal = Number(document.getElementById('payout-salary-grand-total')?.dataset.total) || 0;
  const totalPayout = salaryAndAdjustmentsTotal + thresholdEarnings + serviceEarnings;
  const supplementalTotal = [...specialSchedules, ...adjustments, ...reimbursements].reduce((sum, item) => sum + (Number(item.value ?? item.amount) || 0), 0);
  const liveSalaryPaid = salaryAndAdjustmentsTotal - supplementalTotal;
  let rows = row(liveSalaryPaid !== Number(record.salary) ? 'Prorated Salary' : 'Basic Salary', liveSalaryPaid !== Number(record.salary) ? 'Based on eligible scheduled workdays' : 'Monthly Basic Salary', liveSalaryPaid);
  adjustments.forEach(item => { rows += row('Adjustment', item.label || item.description || 'Adjustment', item.value ?? item.amount); });
  reimbursements.forEach(item => { rows += row('Reimbursement', item.label || item.description || 'Reimbursement', item.value ?? item.amount); });
  specialSchedules.forEach(item => { rows += row('Special Payout', `${item.label || 'Special Payout'} (Day ${item.day})`, item.value); });
  if (thresholdEarnings) rows += row('Earnings Past Threshold', 'Extra installation credits above threshold', thresholdEarnings);
  if (serviceEarnings) rows += row('Service Job Earnings', 'Extra paid service jobs', serviceEarnings);
  if (Number(record.commissions)) rows += row('Commissions', 'Sales Commissions', record.commissions);

  const schedules = [...(payoutTrackerData.config?.payoutSchedules || [15, 30])].map(Number).sort((a, b) => a - b);
  const cutoffValues = schedules.map(() => liveSalaryPaid / (schedules.length || 1));
  const cutoffIndexForDay = day => {
    const index = schedules.findIndex(cutoff => Number(day) <= cutoff);
    return index === -1 ? schedules.length - 1 : index;
  };
  specialSchedules.forEach(item => { cutoffValues[cutoffIndexForDay(item.day)] += Number(item.value) || 0; });
  [...adjustments, ...reimbursements].forEach(item => {
    const itemDay = item.date ? new Date(item.date).getUTCDate() : schedules[schedules.length - 1];
    cutoffValues[cutoffIndexForDay(itemDay)] += Number(item.value ?? item.amount) || 0;
  });
  if (cutoffValues.length) {
    const allocated = cutoffValues.reduce((sum, value) => sum + value, 0);
    cutoffValues[cutoffValues.length - 1] += totalPayout - allocated;
  }
  const cutoffHtml = schedules.map((day, index) => `<div style="display:flex;justify-content:space-between;padding:0.5rem 0;font-size:0.85rem;border-bottom:1px dashed #e5e7eb;"><span style="font-weight:500;color:#4b5563;">Cutoff Payout (Day ${day})</span><span style="font-weight:700;color:#111827;font-variant-numeric:tabular-nums;margin-right:12px;">${peso(cutoffValues[index])}</span></div>`).join('');
  const logoUrl = template.logoStyle === 'dark' ? profile.logoDark : profile.logoLight;
  const employeeName = [currentInstaller.first_name, currentInstaller.last_name].filter(Boolean).join(' ');
  const companyAddress = [profile.companyAddressLine1, profile.companyAddressLine2].filter(Boolean).map(escapeHtml).join('<br>');
  const companyContact = [profile.email, profile.phone].filter(Boolean).map(escapeHtml).join('<br>');
  const signatureImage = template.signatureUrl ? `<img src="${escapeHtml(template.signatureUrl)}" alt="Signature" style="max-height:100px;max-width:170px;object-fit:contain;display:block;">` : '<div style="height:100px;width:150px;"></div>';
  const sheet = document.createElement('div');
  sheet.innerHTML = `<div style="display:flex;flex-direction:column;justify-content:space-between;min-height:250mm;box-sizing:border-box;background:#fff;color:#111827;padding:3rem 3rem 2.5rem 3rem;">
    <div><div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1rem;margin-bottom:1.5rem;"><div>${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="max-height:48px;max-width:150px;display:block;margin-bottom:0.5rem;filter:grayscale(1);">` : ''}</div><div style="text-align:right;font-size:0.7rem;line-height:1.25;color:#4b5563;"><strong style="display:block;margin-bottom:3px;color:#111827;font-size:0.7rem;font-weight:800;">${escapeHtml(profile.companyName || 'Brightkey Solutions')}</strong>${companyAddress}<br>${companyContact}</div></div>
    <div style="text-align:center;margin-bottom:1.5rem;"><div style="font-size:1.6rem;font-weight:900;letter-spacing:1px;color:#111827;text-transform:uppercase;">Payslip</div><div style="font-size:0.95rem;color:#4b5563;margin-top:0.1rem;"><strong>${escapeHtml(monthText)}</strong></div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;background:#f9fafb;padding:0.85rem;border-radius:6px;margin-bottom:1.5rem;border:1px solid #e5e7eb;"><div><div style="margin-bottom:0.4rem;"><span style="font-size:0.65rem;text-transform:uppercase;color:#6b7280;font-weight:600;display:block;">Employee Name</span><strong style="font-size:0.8rem;color:#111827;">${escapeHtml(employeeName)}</strong></div><div><span style="font-size:0.65rem;text-transform:uppercase;color:#6b7280;font-weight:600;display:block;">Department</span><strong style="font-size:0.8rem;color:#111827;">${escapeHtml(record.department || currentInstaller.department || '—')}</strong></div></div><div><div style="margin-bottom:0.4rem;"><span style="font-size:0.65rem;text-transform:uppercase;color:#6b7280;font-weight:600;display:block;">Reporting To</span><strong style="font-size:0.8rem;color:#111827;">—</strong></div><div><span style="font-size:0.65rem;text-transform:uppercase;color:#6b7280;font-weight:600;display:block;">Position / Title</span><strong style="font-size:0.8rem;color:#111827;">${escapeHtml(record.position || currentInstaller.title || '—')}</strong></div></div></div>
    <div style="margin-bottom:2rem;"><div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;">Earnings &amp; Adjustments Breakdown</div><table style="width:100%;border-collapse:collapse;font-size:0.85rem;"><thead><tr style="background:#f3f4f6;text-align:left;"><th style="padding:0.5rem 0.75rem;border-bottom:1px solid #d1d5db;font-weight:700;">Type</th><th style="padding:0.5rem 0.75rem;border-bottom:1px solid #d1d5db;font-weight:700;">Description</th><th style="padding:0.5rem 0.75rem;border-bottom:1px solid #d1d5db;text-align:right;font-weight:700;width:120px;">Amount</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div style="margin-bottom:2rem;max-width:400px;margin-left:auto;"><div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:0.5rem;border-bottom:1px solid #111827;padding-bottom:0.25rem;">Payout Schedule Allocation</div>${cutoffHtml}<div style="display:flex;justify-content:space-between;padding:0.75rem 0;font-size:1rem;font-weight:800;border-top:2px solid #111827;"><span>TOTAL PAYOUT</span><span style="font-variant-numeric:tabular-nums;margin-right:12px;">${peso(totalPayout)}</span></div></div></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:auto;padding-top:2rem;"><div style="font-size:0.72rem;color:#6b7280;max-width:320px;line-height:1.2;">This payslip is generated through Brightkey ERP and serves as an official payroll record. Any concerns regarding computation should be reported within seven (7) days of issuance.</div><div style="display:flex;flex-direction:column;align-items:center;width:180px;"><div style="height:105px;display:flex;align-items:center;justify-content:center;width:100%;">${signatureImage}</div><div style="font-size:0.85rem;font-weight:700;border-top:1px solid #111827;width:100%;text-align:center;padding-top:0.25rem;margin-top:0.25rem;">${escapeHtml(template.signatoryName || 'Authorized Signatory')}</div><div style="font-size:0.72rem;color:#6b7280;width:100%;text-align:center;">Authorized Signatory</div></div></div>
  </div>`;
  const button = document.getElementById('btn-download-installer-payslip');
  button.disabled = true;
  try {
    await html2pdf().set({ margin:[10,10,10,10], filename:`Payslip_${employeeName.replace(/\s+/g, '_')}_${monthText.replace(/\s+/g, '_')}.pdf`, image:{type:'jpeg',quality:0.98}, html2canvas:{scale:2,useCORS:true,letterRendering:true}, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} }).from(sheet).save();
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
  const leadWeight = config.lead_credit !== undefined ? config.lead_credit : 1.0;
  const assistWeight = config.assist_credit !== undefined ? config.assist_credit : 0.5;
  const leadRateVal = config.lead_rate || 1000;
  const assistRateVal = config.assist_rate || 500;
  const extraServicesList = (config.extra_services || []).map(es => {
    let sku = es.sku || es.name || '';
    if (sku === 'Welding Baseplate Metal') sku = 'BASEPLATE-M';
    if (sku === 'Welding Baseplate Stainless') sku = 'BASEPLATE-S';
    return { sku, rate: es.rate };
  });

  // Update threshold settings labels in UI
  document.getElementById('payout-lead-weight').textContent = leadWeight.toFixed(1);
  document.getElementById('payout-assist-weight').textContent = assistWeight.toFixed(1);
  document.getElementById('payout-target-threshold').textContent = thresholdVal + ' Counts';

  // 1. Gather all bookings for selected month
  const monthBookings = dbBookings.filter(b => {
    if (!b.scheduled_date) return false;
    const d = new Date(b.scheduled_date);
    const bookingMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return bookingMonthKey === targetMonthKey;
  });

  const doorJobs = [];
  monthBookings.forEach(b => {
    const assignmentType = String(b.product_skus || '').trim().toLowerCase();
    const orderNo = String(b.order_no || '').toUpperCase();
    const isNonCreditableJob = assignmentType === 'day off' || assignmentType === 'ocular' || assignmentType === 'backjob'
      || orderNo.startsWith('DO-') || orderNo.startsWith('OC-') || orderNo.startsWith('BJ-');
    if (isNonCreditableJob) return;

    const assignedDoors = getInstallerAssignedDoorsForBooking(b, myId);
    assignedDoors.forEach(d => {
      if (d.completed) {
        doorJobs.push({
          completed_at: d.completed_at || b.updated_at || b.created_at || b.scheduled_date,
          roles: d.roles,
          skus: d.skus,
          scheduled_date: b.scheduled_date
        });
      }
    });
  });

  // Sort doorJobs chronologically by scheduled_date
  doorJobs.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  let leadCount = 0;
  let assistCount = 0;
  let serviceEarnings = 0;
  const serviceCounts = {};

  let runningCredit = 0;
  let thresholdEarnings = 0;

  doorJobs.forEach(job => {
    let weight = 0;
    if (job.roles.includes('lead')) {
      leadCount++;
      weight = leadWeight;
    } else if (job.roles.includes('assist')) {
      assistCount++;
      weight = assistWeight;
    }

    if (!isOwner && job.roles.includes('service')) {
      job.skus.forEach(sku => {
        const matchedService = extraServicesList.find(es => es.sku === sku);
        if (matchedService) {
          serviceCounts[sku] = (serviceCounts[sku] || 0) + 1;
          serviceEarnings += matchedService.rate;
        }
      });
    }

    const previousCredit = runningCredit;
    const newCredit = previousCredit + weight;
    if (!isOwner && newCredit > thresholdVal) {
      const extraCredit = weight;
      thresholdEarnings += extraCredit * leadRateVal;
    }
    runningCredit = newCredit;
  });

  const totalCredit = runningCredit;
  
  // Update Threshold Progress
  const thresholdSummary = `${totalCredit.toFixed(1)} / ${thresholdVal} Counts`;
  document.getElementById('payout-threshold-summary').textContent = thresholdSummary;
  document.getElementById('payout-lead-count').textContent = leadCount;
  document.getElementById('payout-assist-count').textContent = assistCount;
  document.getElementById('payout-accumulated-credit').textContent = totalCredit.toFixed(1);

  // Render gamified progress bar
  const percent = Math.min(100, Math.max(0, (totalCredit / thresholdVal) * 100));
  const fillEl = document.getElementById('payout-threshold-fill');
  const percentEl = document.getElementById('payout-threshold-percent');
  if (fillEl) fillEl.style.width = `${percent}%`;
  if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;

  // 2. Calculate threshold earnings (extra works past threshold)
  let thresholdEarningsDetailsHtml = '';

  if (totalCredit > thresholdVal) {
    const extraCredit = thresholdEarnings / leadRateVal;

    thresholdEarningsDetailsHtml = `
      <div style="display:flex; justify-content:space-between;">
        <span>Extra Credits:</span>
        <strong>+${extraCredit.toFixed(1)}</strong>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-muted);">
        <span>Lead Payout Rate (1.0 cr):</span>
        <span>₱${leadRateVal.toLocaleString()}</span>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--text-muted);">
        <span>Assist Payout Rate (0.5 cr):</span>
        <span>₱${assistRateVal.toLocaleString()}</span>
      </div>
    `;
  } else {
    thresholdEarningsDetailsHtml = `<div style="font-style:italic; color:var(--text-muted); font-size:0.8rem;">Threshold not reached yet (${totalCredit.toFixed(1)} / ${thresholdVal}).</div>`;
  }

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
          <span>${escapeHtml(sku)} (${count} x ₱${rate.toLocaleString()}):</span>
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

  // 4. Grand Total
  const grandTotal = thresholdEarnings + serviceEarnings;
  document.getElementById('payout-grand-total').textContent = peso(grandTotal);
  const salaryTotal = Number(document.getElementById('payout-salary-grand-total')?.dataset.total) || 0;
  const overallTotal = document.getElementById('payout-overall-grand-total');
  if (overallTotal) overallTotal.textContent = peso(salaryTotal + grandTotal);
}
