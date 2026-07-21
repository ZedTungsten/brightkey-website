'use strict';

function populateTrackerMonthSelect() {
  const select = document.getElementById('tracker-month-select');
  const paySelect = document.getElementById('payouts-month-select');
  if (!select && !paySelect) return;
  
  const options = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const optVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const optText = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ val: optVal, text: optText });
  }

  if (select) {
    select.innerHTML = '';
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.val;
      opt.textContent = o.text;
      select.appendChild(opt);
    });
  }

  if (paySelect) {
    paySelect.innerHTML = '';
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o.val;
      opt.textContent = o.text;
      paySelect.appendChild(opt);
    });
  }
}

function drawJobTracker() {
  if (!currentInstaller) return;
  const select = document.getElementById('tracker-month-select');
  if (!select) return;
  
  const targetMonthKey = select.value; // e.g. "2026-06"
  const myId = currentInstaller.id;

  let leadCount = 0;
  let assistCount = 0;
  let totalCount = 0;
  let listHtml = '';

  // Filter from dbBookings
  const monthBookings = dbBookings.filter(b => {
    if (!b.scheduled_date) return false;
    const d = new Date(b.scheduled_date);
    const bookingMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return bookingMonthKey === targetMonthKey;
  });

  // Sort by scheduled_date earliest first
  monthBookings.sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  monthBookings.forEach(b => {
    const assignmentType = String(b.product_skus || '').trim().toLowerCase();
    const isDayOff = assignmentType === 'day off' || (b.order_no && b.order_no.startsWith('DO-'));
    const excludeFromRoleCounts = isDayOff || assignmentType === 'ocular' || assignmentType === 'backjob';
    const assignedDoors = getInstallerAssignedDoorsForBooking(b, myId);
    assignedDoors.forEach(d => {
      if (!isDayOff) {
        totalCount++;
      }

      if (!excludeFromRoleCounts) {
        if (d.roles.includes('lead')) {
          leadCount++;
        } else if (d.roles.includes('assist')) {
          assistCount++;
        }
      }

      const date = new Date(b.scheduled_date);
      const dateLabel = `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
      
      const statusBadge = d.completed 
        ? `<span style="font-size:0.68rem; font-weight:700; background:#D1FAE5; color:#065F46; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Completed</span>`
        : `<span style="font-size:0.68rem; font-weight:700; background:#FEF3C7; color:#92400E; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Scheduled</span>`;
      
      let roleBadgesHtml = '';
      if (d.roles.includes('lead')) {
        roleBadgesHtml += `<span style="font-size:0.68rem; font-weight:700; background:#CFFAFE; color:#0891B2; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Lead</span>`;
      }
      if (d.roles.includes('assist')) {
        roleBadgesHtml += `<span style="font-size:0.68rem; font-weight:700; background:#F3F4F6; color:#374151; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Assist</span>`;
      }
      if (d.roles.includes('service')) {
        roleBadgesHtml += `<span style="font-size:0.68rem; font-weight:700; background:#F3E8FF; color:#7E22CE; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">Service</span>`;
      }

      const displayLabel = isDayOff ? 'Day off' : `${b.customer_name || 'Client'} (${d.doorName})`;
      const skuLabel = d.skus.join(' | ') || 'No Lock';

      listHtml += `
        <div style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.85rem; display: flex; flex-direction: column; gap: 0.5rem; cursor: pointer;" onclick="openDetailsModal('${b.id}')">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.75rem; font-weight: 700; color: var(--text-muted);">${b.order_no || 'Job'}</span>
            <div style="display: flex; gap: 0.35rem; align-items: center;">
              ${roleBadgesHtml}
              ${statusBadge}
            </div>
          </div>
          <div style="font-size: 0.9rem; font-weight: 700; color: var(--text-primary);">${escapeHtml(displayLabel)}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--text-secondary); margin-top: 0.15rem;">
            <span>${dateLabel}</span>
            <span style="font-weight: 600; color: var(--cyan-light);">${escapeHtml(skuLabel)}</span>
          </div>
        </div>
      `;
    });
  });

  if (!listHtml) {
    listHtml = `<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.88rem; font-style: italic;">No job assignments recorded for this month.</div>`;
  }

  document.getElementById('tracker-lead-count').textContent = leadCount;
  document.getElementById('tracker-assist-count').textContent = assistCount;
  document.getElementById('tracker-total-count').textContent = totalCount;
  document.getElementById('tracker-job-list').innerHTML = listHtml;
}
