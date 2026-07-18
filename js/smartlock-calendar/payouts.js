'use strict';

function drawPayouts() {
  if (!currentInstaller) return;
  const select = document.getElementById('payouts-month-select');
  if (!select) return;
  
  const targetMonthKey = select.value;
  const myId = currentInstaller.id;

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

    if (job.roles.includes('service')) {
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
    if (newCredit > thresholdVal) {
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

  document.getElementById('payout-extra-total').textContent = `₱${thresholdEarnings.toLocaleString()}`;
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
          <strong>₱${subtotal.toLocaleString()}</strong>
        </div>
      `;
    });
  } else {
    servicesDetailsHtml = `<div style="font-style:italic; color:var(--text-muted); font-size:0.8rem;">No extra paid services recorded this month.</div>`;
  }

  document.getElementById('payout-services-total').textContent = `₱${serviceEarnings.toLocaleString()}`;
  document.getElementById('payout-services-details').innerHTML = servicesDetailsHtml;

  // 4. Grand Total
  const grandTotal = thresholdEarnings + serviceEarnings;
  document.getElementById('payout-grand-total').textContent = `₱${grandTotal.toLocaleString()}`;
}
