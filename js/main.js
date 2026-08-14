/* ============================================================
   BrightKey — main.js
   Shared scripts: nav, scroll reveal, toasts, modals, etc.
   ============================================================ */

'use strict';

// BK_SPECIAL_PAYOUT_HISTORY_START
(function registerSpecialPayoutHistory(root) {
  const monthKey = value => /^\d{4}-\d{2}$/.test(String(value || '')) ? String(value) : '';
  const currentMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };
  const previousMonthKey = value => {
    const [year, month] = monthKey(value).split('-').map(Number);
    if (!year || !month) return '';
    const date = new Date(year, month - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };
  const appliesToMonth = (schedule, value) => {
    const target = monthKey(value);
    if (!target) return true;
    const from = monthKey(schedule?.effectiveFrom);
    const to = monthKey(schedule?.effectiveTo);
    return (!from || from <= target) && (!to || to >= target);
  };
  const copy = schedule => ({ ...schedule });

  root.BKSpecialPayoutHistory = Object.freeze({
    currentMonthKey,
    previousMonthKey,
    forMonth: (schedules = [], value) => schedules.filter(schedule => appliesToMonth(schedule, value)),
    activeNow(schedules = []) { return this.forMonth(schedules, currentMonthKey()); },
    add: (schedules = [], schedule) => [...schedules.map(copy), { ...schedule, effectiveFrom: currentMonthKey() }],
    edit(schedules = [], id, changes) {
      const nowKey = currentMonthKey();
      const existing = schedules.find(schedule => schedule.id === id);
      if (!existing) return schedules.map(copy);
      if (monthKey(existing.effectiveFrom) === nowKey) {
        return schedules.map(schedule => schedule.id === id ? { ...schedule, ...changes } : copy(schedule));
      }
      const historical = schedules.map(schedule => schedule.id === id ? { ...schedule, effectiveTo: previousMonthKey(nowKey) } : copy(schedule));
      return [...historical, { ...existing, ...changes, id: `spec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`, effectiveFrom: nowKey, effectiveTo: undefined }];
    },
    remove(schedules = [], id) {
      const nowKey = currentMonthKey();
      const existing = schedules.find(schedule => schedule.id === id);
      if (!existing) return schedules.map(copy);
      if (monthKey(existing.effectiveFrom) === nowKey) return schedules.filter(schedule => schedule.id !== id).map(copy);
      return schedules.map(schedule => schedule.id === id ? { ...schedule, effectiveTo: previousMonthKey(nowKey) } : copy(schedule));
    }
  });
})(globalThis);
// BK_SPECIAL_PAYOUT_HISTORY_END

// BK_EMPLOYMENT_PERIOD_START
(function registerEmploymentPeriod(root) {
  const dateKey = value => String(value || '').slice(0, 10);
  const monthEndKey = (year, zeroBasedMonth) => {
    const lastDay = new Date(Number(year), Number(zeroBasedMonth) + 1, 0).getDate();
    return `${Number(year)}-${String(Number(zeroBasedMonth) + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  };

  root.BKEmploymentPeriod = Object.freeze({
    isHiredByDate(employee, periodEnd) {
      const hiredDate = dateKey(employee?.date_hired);
      return !hiredDate || hiredDate <= dateKey(periodEnd);
    },

    isHiredByMonthEnd(employee, year, zeroBasedMonth) {
      return this.isHiredByDate(employee, monthEndKey(year, zeroBasedMonth));
    }
  });
})(globalThis);
// BK_EMPLOYMENT_PERIOD_END

// BK_OPEX_SALARIES_START
(function registerOpexSalaryCalculator(root) {
  root.BKOpexSalaries = Object.freeze({
    calculateMonth({ employees = [], payslipRecords = [], payoutSchedules = [], specialSchedules = [], regularPayoutState = {}, specialPayoutState = {}, monthKey } = {}) {
      const schedules = payoutSchedules.map(Number).filter(Number.isFinite);
      const effectiveSchedules = schedules.length ? schedules : [15, 30];
      const [year, month] = String(monthKey || '').split('-').map(Number);
      if (!year || !month) return [];

      return employees
        .filter(employee => root.BKEmploymentPeriod.isHiredByMonthEnd(employee, year, month - 1))
        .map(employee => {
          const record = payslipRecords.find(item => item.employee_id === employee.id && (!item.payout_month || item.payout_month === monthKey));
          const monthlySalary = Number(employee.salary || employee.monthly_salary) || 0;
          const salaryPerSchedule = monthlySalary / effectiveSchedules.length;
          const paidSalaryFromState = effectiveSchedules.reduce((sum, day) => {
            const isPaid = regularPayoutState?.[monthKey]?.[`${employee.id}_${day}`] === true;
            return sum + (isPaid ? salaryPerSchedule : 0);
          }, 0);

          let baseSalary;
          let specialPayout;
          if (record) {
            const recordedBasicPaid = Number(record.basic_paid) || 0;
            baseSalary = employee.employment_status === 'Active'
              ? (recordedBasicPaid || Number(record.salary) || monthlySalary)
              : (recordedBasicPaid || paidSalaryFromState);
            specialPayout = Number(record.special_payouts) || 0;
          } else {
            baseSalary = employee.employment_status === 'Active' ? monthlySalary : paidSalaryFromState;
            const monthSpecialSchedules = root.BKSpecialPayoutHistory?.forMonth(specialSchedules, monthKey) || specialSchedules;
            specialPayout = monthSpecialSchedules
              .filter(schedule => schedule.employeeId === employee.id)
              .reduce((sum, schedule) => {
                const isPaid = specialPayoutState?.[monthKey]?.[`${employee.id}_${schedule.day}`] === true;
                return sum + (isPaid ? (Number(schedule.value) || 0) : 0);
              }, 0);
          }

          return { employee, baseSalary, specialPayout, total: baseSalary + specialPayout };
        });
    }
  });
})(globalThis);
// BK_OPEX_SALARIES_END

// BK_INSTALLER_PAYOUTS_START
(function registerInstallerPayoutCalculator(root) {
  function normalizeSku(value) {
    let sku = String(value || '').trim();
    if (sku === 'Welding Baseplate Metal') sku = 'BASEPLATE-M';
    if (sku === 'Welding Baseplate Stainless') sku = 'BASEPLATE-S';
    return sku.toUpperCase();
  }

  function isEffective(rule, workDate) {
    return !rule?.effective_from || !workDate || String(workDate).slice(0, 10) >= String(rule.effective_from).slice(0, 10);
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

  const rulesApi = Object.freeze({
    serviceRules(settings = {}) {
      const skus = [...new Set(payoutRules(settings).filter(rule => String(rule.assignment).toLowerCase() === 'service').map(rule => normalizeSku(rule.sku)))];
      return skus.map(sku => latestEffectiveRule(payoutRules(settings), { assignment: 'Service', sku }, new Date().toISOString().slice(0, 10))).filter(Boolean).map(rule => ({ sku: normalizeSku(rule.sku), rate: Number(rule.amount ?? rule.rate ?? rule.value) || 0, effective_from: rule.effective_from || null }));
    },
    creditForJob(settings = {}, job = {}) {
      const target = assignmentFor(job.roles, job.skus);
      const candidates = target.assignment === 'Service'
        ? (target.skus || [target.sku]).map(sku => latestEffectiveRule(creditRules(settings), { assignment: 'Service', sku }, job.workDate)).filter(Boolean)
        : [latestEffectiveRule(creditRules(settings), target, job.workDate)].filter(Boolean);
      const rule = candidates[0];
      return Number(rule?.credit ?? rule?.value) || 0;
    },
    thresholdRateForJob(settings = {}, job = {}) {
      const target = assignmentFor(job.roles, job.skus);
      const candidates = target.assignment === 'Service'
        ? (target.skus || [target.sku]).map(sku => latestEffectiveRule(payoutRules(settings), { assignment: 'Service', sku }, job.workDate)).filter(Boolean)
        : [latestEffectiveRule(payoutRules(settings), target, job.workDate)].filter(Boolean);
      const rule = candidates[0];
      return Number(rule?.amount ?? rule?.rate ?? rule?.value) || 0;
    },
    servicePayoutsForJob(settings = {}, job = {}) {
      if (!(job.roles || []).some(role => String(role).toLowerCase() === 'service')) return [];
      const skus = (job.skus || []).map(normalizeSku);
      return skus.map(sku => latestEffectiveRule(payoutRules(settings), { assignment: 'Service', sku }, job.workDate)).filter(Boolean).map(rule => ({ sku: normalizeSku(rule.sku), amount: Number(rule.amount ?? rule.rate ?? rule.value) || 0 }));
    },
    thresholdForDate(settings = {}, workDate) {
      const history = Array.isArray(settings.threshold_history) ? settings.threshold_history : [];
      const rule = history.filter(item => isEffective(item, workDate)).sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')))[0];
      return Number(rule?.value ?? settings.installations_before_crediting ?? 15) || 0;
    }
  });
  root.BKInstallerPayoutRules = rulesApi;

  function cutoffBucket(dateValue, schedules) {
    const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return null;
    let year = Number(match[1]);
    let month = Number(match[2]);
    const day = Number(match[3]);
    const sorted = schedules.map(Number).filter(Boolean).sort((a, b) => a - b);
    if (!sorted.length) sorted.push(30);
    const cutoffDay = sorted.find(cutoff => day <= cutoff);
    if (cutoffDay) return { monthKey: `${year}-${String(month).padStart(2, '0')}`, day: cutoffDay };
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    return { monthKey: `${year}-${String(month).padStart(2, '0')}`, day: sorted[0] };
  }

  root.BKInstallerPayouts = Object.freeze({
    calculateMonth({ employees = [], bookings = [], payoutSettings = {}, payoutSchedules = [], monthKey, resolveAssignedDoors } = {}) {
      if (!monthKey || typeof resolveAssignedDoors !== 'function') return [];
      const ocularRepairFrom = String(payoutSettings.ocular_repair_effective_from || '');
      const eligibleBookings = bookings
        .filter(booking => booking.scheduled_date && String(booking.status || '').toLowerCase() !== 'cancelled')
        .sort((a, b) => String(a.scheduled_date).localeCompare(String(b.scheduled_date)));

      return employees.map(employee => {
        let leadCount = 0;
        let assistCount = 0;
        let completedCredit = 0;
        let thresholdEarnings = 0;
        let serviceEarnings = 0;
        const serviceCounts = {};
        const creditBySourceMonth = {};

        eligibleBookings.forEach(booking => {
          const skus = String(booking.product_skus || '').split('|').map(sku => sku.trim().toLowerCase()).filter(Boolean);
          const orderNo = String(booking.order_no || '').toUpperCase();
          const isOcular = skus.includes('ocular');
          const isRepair = skus.includes('repair');
          if (skus.includes('day off') || orderNo.startsWith('DO-') || skus.includes('backjob') || orderNo.startsWith('BJ-')) return;
          if ((isOcular || isRepair) && (!ocularRepairFrom || booking.scheduled_date < ocularRepairFrom)) return;

          resolveAssignedDoors(booking, employee.id).forEach(door => {
            if (!door.completed) return;
            const roles = isOcular ? ['ocular'] : isRepair ? ['repair'] : door.roles;
            const jobSkus = isOcular ? ['OCULAR'] : isRepair ? ['REPAIR'] : door.skus;
            const weight = rulesApi.creditForJob(payoutSettings, { roles, skus: jobSkus, workDate: booking.scheduled_date });
            const sourceMonth = String(booking.scheduled_date).slice(0, 7);
            const threshold = rulesApi.thresholdForDate(payoutSettings, booking.scheduled_date);
            const previousCredit = creditBySourceMonth[sourceMonth] || 0;
            const newCredit = previousCredit + weight;
            const thresholdPay = newCredit > threshold ? rulesApi.thresholdRateForJob(payoutSettings, { roles, skus: jobSkus, workDate: booking.scheduled_date }) : 0;
            creditBySourceMonth[sourceMonth] = newCredit;

            if (sourceMonth === monthKey) {
              completedCredit += weight;
              if (roles.includes('lead')) leadCount += 1;
              else if (roles.includes('assist')) assistCount += 1;
            }

            const bucket = cutoffBucket(booking.scheduled_date, payoutSchedules);
            if (!bucket || bucket.monthKey !== monthKey) return;
            thresholdEarnings += thresholdPay;
            rulesApi.servicePayoutsForJob(payoutSettings, { roles: door.roles, skus: door.skus, workDate: booking.scheduled_date }).forEach(service => {
              serviceCounts[service.sku] = (serviceCounts[service.sku] || 0) + 1;
              serviceEarnings += service.amount;
            });
          });
        });

        return { employee, leadCount, assistCount, completedCredit, thresholdEarnings, serviceCounts, serviceEarnings, total: thresholdEarnings + serviceEarnings };
      });
    }
  });
})(globalThis);
// BK_INSTALLER_PAYOUTS_END

// ── Read URL query parameter for coupon_code ──────────────────
(function checkCouponQueryParam() {
  const params = new URLSearchParams(window.location.search);
  const coupon = params.get('coupon_code');
  if (coupon) {
    localStorage.setItem('bk_applied_coupon', coupon.trim().toUpperCase());
  }
})();

// ── Active nav link ─────────────────────────────────────────
(function setActiveNav() {
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });
})();

// ── Mobile nav toggle ───────────────────────────────────────
(function initMobileNav() {
  const toggle = document.querySelector('.nav__toggle');
  const links  = document.querySelector('.nav__links');
  const cta    = document.querySelector('.nav__cta');

  if (!toggle) return;

  toggle.addEventListener('click', () => {
    const isOpen = toggle.classList.toggle('open');
    links?.classList.toggle('mobile-open', isOpen);
    cta?.classList.toggle('mobile-open', isOpen);
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!toggle.contains(e.target) && !links?.contains(e.target)) {
      toggle.classList.remove('open');
      links?.classList.remove('mobile-open');
      cta?.classList.remove('mobile-open');
    }
  });

  // Close on nav link click (mobile)
  links?.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('open');
      links.classList.remove('mobile-open');
      cta?.classList.remove('mobile-open');
    });
  });
})();

// ── Scroll reveal ───────────────────────────────────────────
(function initReveal() {
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
})();

// ── Toast notifications ─────────────────────────────────────
const Toast = (() => {
  let container = document.getElementById('toast-container');

  function ensureContainer() {
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  function show(message, type = 'success', duration = 3000) {
    if (type === 'error' || type === 'danger') {
      message = window.BKFriendlyError ? window.BKFriendlyError(message) : message;
    }
    const c     = ensureContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    c.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  return { show, success: m => show(m, 'success'), error: m => show(m, 'error') };
})();

window.Toast = Toast;

// ── Modal helpers ───────────────────────────────────────────
const Modal = (() => {
  function open(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Close on overlay click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close(id);
    });
  }

  function close(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  // Wire up data-modal-open / data-modal-close buttons
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => open(btn.dataset.modalOpen));
  });

  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => close(btn.dataset.modalClose));
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(el => {
        close(el.id);
      });
    }
  });

  return { open, close };
})();

window.Modal = Modal;

// ── Styled decision dialogs ─────────────────────────────────
const BKDialog = (() => {
  let overlay;
  let activeResolve;

  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'bk-dialog-overlay';
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(9,9,11,0.48);backdrop-filter:blur(4px);align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
      <div role="dialog" aria-modal="true" aria-labelledby="bk-dialog-title" style="background:var(--bg-surface,#fff);border:1px solid var(--border,#e5e7eb);border-radius:8px;box-shadow:var(--shadow-lg,0 24px 48px rgba(15,23,42,0.18));width:min(420px,100%);overflow:hidden;">
        <div style="padding:1.25rem 1.5rem;border-bottom:1px solid var(--border,#e5e7eb);">
          <div id="bk-dialog-title" style="font-size:0.95rem;font-weight:700;color:var(--text-primary,#09090b);"></div>
        </div>
        <div style="padding:1.25rem 1.5rem;display:flex;flex-direction:column;gap:1rem;">
          <div id="bk-dialog-message" style="font-size:0.86rem;line-height:1.55;color:var(--text-secondary,#52525b);white-space:pre-line;"></div>
          <input id="bk-dialog-input" type="text" style="display:none;width:100%;padding:0.65rem 0.75rem;border:1px solid var(--border,#d4d4d8);border-radius:6px;background:#fff;color:#09090b;font-size:0.9rem;outline:none;" />
        </div>
        <div style="padding:1rem 1.5rem;border-top:1px solid var(--border,#e5e7eb);background:var(--bg-elevated,#f8fafc);display:flex;justify-content:flex-end;gap:0.75rem;">
          <button type="button" id="bk-dialog-cancel" class="btn btn-outline">Cancel</button>
          <button type="button" id="bk-dialog-ok" class="btn btn-primary">Continue</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) finish(null);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.style.display === 'flex') finish(null);
    });
    overlay.querySelector('#bk-dialog-cancel').addEventListener('click', () => finish(null));
    overlay.querySelector('#bk-dialog-ok').addEventListener('click', () => {
      const input = overlay.querySelector('#bk-dialog-input');
      finish(input.style.display === 'none' ? true : input.value);
    });
    return overlay;
  }

  function finish(value) {
    if (!overlay || overlay.style.display === 'none') return;
    overlay.style.display = 'none';
    document.body.style.overflow = '';
    const resolve = activeResolve;
    activeResolve = null;
    if (resolve) resolve(value);
  }

  function open({ title, message, okText = 'Continue', cancelText = 'Cancel', defaultValue = '', input = false, danger = false }) {
    const el = ensure();
    el.querySelector('#bk-dialog-title').textContent = title || 'Confirm Action';
    el.querySelector('#bk-dialog-message').textContent = message || '';
    const inputEl = el.querySelector('#bk-dialog-input');
    inputEl.style.display = input ? 'block' : 'none';
    inputEl.value = defaultValue || '';
    const cancelBtn = el.querySelector('#bk-dialog-cancel');
    const okBtn = el.querySelector('#bk-dialog-ok');
    cancelBtn.textContent = cancelText;
    okBtn.textContent = okText;
    okBtn.style.background = danger ? 'var(--danger,#dc2626)' : '';
    okBtn.style.borderColor = danger ? 'var(--danger,#dc2626)' : '';
    okBtn.style.color = danger ? '#fff' : '';
    el.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (input) setTimeout(() => inputEl.focus(), 0);
    return new Promise(resolve => {
      activeResolve = resolve;
    });
  }

  return {
    notice(message, title = 'Notice') {
      return open({ title, message, okText: 'OK', cancelText: 'Close' });
    },
    async ask({ title = 'Confirm Action', message = '', okText = 'Continue', cancelText = 'Cancel', danger = false } = {}) {
      return (await open({ title, message, okText, cancelText, danger })) === true;
    },
    async input({ title = 'Enter Value', message = '', defaultValue = '', okText = 'Save', cancelText = 'Cancel' } = {}) {
      const value = await open({ title, message, defaultValue, okText, cancelText, input: true });
      return typeof value === 'string' ? value : null;
    }
  };
})();

window.BKDialog = BKDialog;

// ── Smooth anchor scrolling ─────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', e => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const navHeight = parseInt(getComputedStyle(document.documentElement)
      .getPropertyValue('--nav-height')) || 64;
    const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 16;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

// ── Floating pill nav on scroll ──────────────────────────────
(function navScrollEffect() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const threshold = 10;
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > threshold);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run on load in case page is already scrolled
})();

var SUPABASE_URL    = window.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
var SUPABASE_ANON   = window.SUPABASE_ANON || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON = SUPABASE_ANON;

var storefrontCompanyPromise = null;
window.BKStorefront = window.BKStorefront || {
  async getCompanyId() {
    if (window.BKStorefrontCompanyId) return window.BKStorefrontCompanyId;
    if (!storefrontCompanyPromise) storefrontCompanyPromise = (async () => {
      const host = window.location.hostname, parts = host.split('.');
      const subdomain = (parts.length > 1 && host !== 'localhost' && host !== '127.0.0.1') ? parts[0] : 'brightkey';
      const rows = await SupabaseREST.select('companies', `subdomain=eq.${encodeURIComponent(subdomain)}&select=id&limit=1`);
      return (window.BKStorefrontCompanyId = rows?.[0]?.id || null);
    })();
    try { return await storefrontCompanyPromise; }
    finally { storefrontCompanyPromise = null; }
  }
};

/**
 * Returns a lightweight Supabase REST helper.
 * Usage:
 *   const db = createSupabaseClient();
 *   await db.insert('contact_submissions', { name, email, message });
 */
function createSupabaseClient() {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON,
    'Authorization': `Bearer ${SUPABASE_ANON}`,
    'Prefer': 'return=minimal',
  };

  async function insert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Supabase error: ${res.status}`);
    }
    return res;
  }

  async function select(table, params = '') {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      headers: { ...headers, 'Prefer': 'return=representation' },
    });
    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);
    return res.json();
  }

  return { insert, select };
}

window.createSupabaseClient = createSupabaseClient;

// ── Bunny.net image helper ──────────────────────────────────
// Replace BUNNY_ZONE with your Pull Zone hostname.
const BUNNY_ZONE = 'https://your-zone.b-cdn.net';

/**
 * Returns an optimised Bunny.net image URL.
 * @param {string} path   – path relative to Pull Zone root
 * @param {object} opts   – { width, height, quality, format }
 */
function bunnyImage(path, { width, height, quality = 85, format = 'webp' } = {}) {
  const params = new URLSearchParams();
  if (width)   params.set('width',   width);
  if (height)  params.set('height',  height);
  if (quality) params.set('quality', quality);
  if (format)  params.set('format',  format);
  const qs = params.toString();
  return `${BUNNY_ZONE}${path}${qs ? '?' + qs : ''}`;
}

window.bunnyImage = bunnyImage;

// ── Form validation helper ──────────────────────────────────
function validateField(input) {
  const value = input.value.trim();
  let error = '';

  if (input.required && !value) {
    error = 'This field is required.';
  } else if (input.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    error = 'Please enter a valid email address.';
  } else if (input.minLength > 0 && value.length < input.minLength) {
    error = `Minimum ${input.minLength} characters required.`;
  }

  const hint = input.parentElement.querySelector('.form-error');
  if (hint) hint.textContent = error;
  input.classList.toggle('error', !!error);
  return !error;
}

function validateForm(form) {
  const inputs = form.querySelectorAll('[required], [data-validate]');
  let valid = true;
  inputs.forEach(input => {
    if (!validateField(input)) valid = false;
  });
  return valid;
}

window.validateField = validateField;
window.validateForm  = validateForm;

// ── Inline validation on blur ───────────────────────────────
document.querySelectorAll('input[required], textarea[required]').forEach(input => {
  input.addEventListener('blur', () => validateField(input));
  input.addEventListener('input', () => {
    if (input.classList.contains('error')) validateField(input);
  });
});

// ── Current year in footer ──────────────────────────────────
const yearEl = document.getElementById('current-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ── Grainient Animated Background ───────────────────────────
// Removed as requested to disable grain/gradient effects across the site.

// ── Dynamically Load cart.js globally ───────────────────────────
(function loadCartScript() {
  if (typeof getCart !== 'undefined') return;
  if (document.querySelector('script[src*="cart.js"]')) return;
  const script = document.createElement('script');
  script.src = '/js/cart.js';
  document.head.appendChild(script);
})();

// ── Theater Mode Image Viewer ──────────────────────────────────
window.showTheaterImage = function(url) {
  let overlay = document.getElementById('bk-theater-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'bk-theater-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(9,9,11,0.9); z-index:100000; display:flex; align-items:center; justify-content:center; cursor:zoom-out; opacity:0; transition:opacity 0.2s ease;';
    overlay.innerHTML = `
      <img id="bk-theater-img" src="" style="max-width:90%; max-height:90%; object-fit:contain; border-radius:8px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); transform:scale(0.95); transition:transform 0.2s ease;" />
      <button style="position:absolute; top:1.5rem; right:1.5rem; background:none; border:none; color:white; font-size:2rem; cursor:pointer; font-weight:300; line-height:1;">&times;</button>
    `;
    overlay.onclick = function() {
      overlay.style.opacity = '0';
      overlay.querySelector('#bk-theater-img').style.transform = 'scale(0.95)';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 200);
    };
    document.body.appendChild(overlay);
  }

  const img = overlay.querySelector('#bk-theater-img');
  img.src = url;
  overlay.style.display = 'flex';
  
  setTimeout(() => {
    overlay.style.opacity = '1';
    img.style.transform = 'scale(1)';
  }, 10);
};

// ── Hybrid Stale Session Autorefresh (Visibility change + Idle timer) ──
(function initStaleSessionAutorefresh() {
  // Only activate on dashboard path urls
  if (!window.location.pathname.includes('/dashboard')) return;

  let lastInteractionTime = Date.now();
  const idleRefreshThreshold = 10 * 60 * 1000; // 10 minutes of complete inactivity
  const idleCheckInterval = 30 * 1000; // Check every 30 seconds
  const skipRefocusRefresh = /^\/dashboard\/(?:ship\/send|inventory(?:\/(?:summary|stats))?)\/?$/.test(window.location.pathname);

  // List of events indicating user activity
  const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
  activityEvents.forEach(evtName => {
    document.addEventListener(evtName, () => {
      lastInteractionTime = Date.now();
    }, { passive: true });
  });

  // 1. Visibility change handler: Immediately refresh when tab is focused/opened
  document.addEventListener('visibilitychange', () => {
    if (!skipRefocusRefresh && document.visibilityState === 'visible') {
      triggerPageRefresh();
    }
  });

  // 2. Window focus handler: Refresh when user switches back to the browser window
  window.addEventListener('focus', () => {
    if (!skipRefocusRefresh) triggerPageRefresh();
  });

  // 3. Background interval loop: Auto-refresh if user has been completely idle
  setInterval(() => {
    const idleDuration = Date.now() - lastInteractionTime;
    if (idleDuration >= idleRefreshThreshold) {
      // Check if user is currently typing/editing an input field
      const activeEl = document.activeElement;
      const isUserEditing = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.tagName === 'SELECT' ||
        activeEl.isContentEditable
      );

      if (!isUserEditing) {
        triggerPageRefresh();
      }
    }
  }, idleCheckInterval);

  // Helper function to safely execute page-level refresh routines
  function triggerPageRefresh() {
    // Reset idle timer to avoid repeating multiple queries immediately
    lastInteractionTime = Date.now();

    // Context-dependent refresh functions
    if (window.refreshDashboard && typeof window.refreshDashboard === 'function') {
      window.refreshDashboard();
    } else if (window.WarehousePage && typeof window.WarehousePage.runAutoSyncInBackground === 'function') {
      window.WarehousePage.runAutoSyncInBackground();
    } else if (window.DeliveryApp && typeof window.DeliveryApp.loadData === 'function') {
      window.DeliveryApp.loadData();
    } else if (window.AttendanceApp && typeof window.AttendanceApp.loadData === 'function') {
      window.AttendanceApp.loadData();
    } else if (window.App && typeof window.App.loadData === 'function') {
      window.App.loadData();
    } else if (window.BKRefreshShipmentsBadge && typeof window.BKRefreshShipmentsBadge === 'function') {
      window.BKRefreshShipmentsBadge();
    }
  }
})();

// ── Unified Footer Component ────────────────────────────────
(function initUnifiedFooter() {
  'use strict';

  if (/^\/dashboard(?:\/|$)/.test(window.location.pathname)) {
    const removeDashboardFooters = () => {
      document.querySelectorAll('footer.footer, footer.catalog-footer, footer#site-footer')
        .forEach(footer => footer.remove());
    };
    removeDashboardFooters();
    document.addEventListener('DOMContentLoaded', removeDashboardFooters, { once: true });
    return;
  }

  const UNIFIED_FOOTER_HTML = `
    <div class="container">
      <div class="footer__grid">
        <div class="footer__brand">
          <a href="/" class="nav__logo"><img src="/assets/logo.svg?v=2" alt="Brightkey" /></a>
          <p>Digital Transformation Partner. Smart software and security solutions for Philippine small businesses.</p>
          <div class="footer__social" style="margin-top:1.5rem;">
            <a href="#" aria-label="Facebook">
              <svg viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
            </a>
            <a href="#" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
            </a>
            <a href="#" aria-label="Instagram">
              <svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
            </a>
          </div>
        </div>
        <div class="footer__col">
          <h4>Products</h4>
          <ul class="footer__links">
            <li><a href="/products#accounting" class="footer__link">Accounting Software</a></li>
            <li><a href="/products#hr"          class="footer__link">HR Software</a></li>
            <li><a href="/products#lms"         class="footer__link">LMS</a></li>
            <li><a href="/products#iot"         class="footer__link">IoT Integration</a></li>
            <li><a href="/products#hardware"    class="footer__link">Security Hardware</a></li>
          </ul>
        </div>
        <div class="footer__col">
          <h4>Company</h4>
          <ul class="footer__links">
            <li><a href="/about"   class="footer__link">About Us</a></li>
            <li><a href="/contact" class="footer__link">Contact</a></li>
            <li><a href="/contact" class="footer__link">Get a Quote</a></li>
          </ul>
        </div>
        <div class="footer__col">
          <h4>Legal</h4>
          <ul class="footer__links">
            <li><a href="/privacy-policy" class="footer__link">Privacy Policy</a></li>
            <li><a href="/terms-of-use"   class="footer__link">Terms of Use</a></li>
            <li><a href="/admin"           class="footer__link">Employee Login</a></li>
          </ul>
        </div>
      </div>

      <div class="footer__bottom">
        <span>&copy; <span id="current-year">${new Date().getFullYear()}</span> Brightkey. All rights reserved.</span>
        <span>Made in the Philippines</span>
      </div>
    </div>
  `;

  function renderFooter() {
    let footerEl = document.querySelector('footer.footer')
      || document.querySelector('footer.catalog-footer')
      || document.querySelector('footer#site-footer')
      || document.querySelector('footer');

    if (!footerEl) {
      footerEl = document.createElement('footer');
      document.body.appendChild(footerEl);
    }

    footerEl.className = 'footer';

    const isCatalog = footerEl.classList.contains('catalog-footer');
    const isExplicit = footerEl.hasAttribute('data-unified-footer');
    const isEmpty = !footerEl.children.length || Boolean(footerEl.querySelector('.catalog-footer__inner'));

    if (isCatalog || isExplicit || isEmpty) {
      footerEl.innerHTML = UNIFIED_FOOTER_HTML;
    } else {
      const yearEl = footerEl.querySelector('#current-year') || footerEl.querySelector('#catalog-year');
      if (yearEl) {
        yearEl.textContent = String(new Date().getFullYear());
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderFooter);
  } else {
    renderFooter();
  }

  window.BKUnifiedFooter = {
    render: renderFooter,
    html: UNIFIED_FOOTER_HTML
  };
})();
