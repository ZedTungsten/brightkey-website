(function () {
  'use strict';

  const REPORT_ROWS = [
    ['due_from', 'Due From'],
    ['company_loan', 'Company Loan'],
    ['company_loan_repayment', 'Company Loan Repayment'],
    ['owner_loan', 'Owner Loan']
  ];
  const ABSOLUTE_START_MONTH = '2025-01';
  const MAX_CALCULATION_MONTHS = 24;
  const VISIBLE_MONTHS = 10;
  const FORMULA_VERSION = 3;

  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const money = value => {
    const amount = Number(value) || 0;
    if (!amount) return '—';
    const formatted = `₱${Math.abs(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return amount < 0 ? `(${formatted})` : formatted;
  };
  const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const monthMeta = date => ({
    key: monthKey(date),
    label: date.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }),
    start: `${monthKey(date)}-01`,
    end: `${monthKey(date)}-${String(new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()).padStart(2, '0')}`
  });
  const monthSequence = (start, end) => {
    if (!start || !end || start > end) return [];
    const cursor = new Date(`${start}-01T00:00:00`);
    const last = new Date(`${end}-01T00:00:00`);
    const keys = [];
    while (cursor <= last) {
      keys.push(monthKey(cursor));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  };
  const followingMonth = key => {
    const date = new Date(`${key}-01T00:00:00`);
    date.setMonth(date.getMonth() + 1);
    return monthKey(date);
  };
  const toast = (message, type = 'success') => window.Toast?.show(message, type);

  window.OwnerViewTabs = {
    async show(view) {
      const accrual = view === 'accrual';
      document.getElementById('monthly-view').hidden = accrual;
      document.getElementById('accrual-view').hidden = !accrual;
      document.getElementById('owner-monthly-tab').classList.toggle('active', !accrual);
      document.getElementById('owner-accrual-tab').classList.toggle('active', accrual);
      document.getElementById('owner-monthly-tab').setAttribute('aria-selected', String(!accrual));
      document.getElementById('owner-accrual-tab').setAttribute('aria-selected', String(accrual));
      if (accrual) await window.OwnerAccrualApp.showFromMonthly();
      else await window.OwnerAccrualApp.showMonthlyFromAccrual();
    }
  };

  window.OwnerAccrualApp = {
    initialized: false,
    companyId: null,
    owners: [],
    accounts: [],
    assignments: {},
    selectedOwnerId: '',
    monthOffset: 0,
    earliestMonth: null,
    calculationStart: ABSOLUTE_START_MONTH,
    months: [],
    locked: [],
    values: {},
    closingTotals: {},
    calculationLimited: false,
    lockMode: false,

    async init() {
      if (this.initialized) return;
      this.initialized = true;
      try {
        const auth = await window.BKAuth.checkRoleGate(['Owner', 'Admin', 'HR', 'Finance'], '../../admin.html');
        if (!auth) return;
        const sb = window.BKAuth.sb;
        const { data: company, error: companyError } = await sb.from('companies').select('id').eq('tenant_id', auth.tenantId).limit(1).maybeSingle();
        if (companyError) throw companyError;
        this.companyId = company?.id || null;
        if (!this.companyId) throw new Error('Company could not be resolved.');
        await this.loadOptions();
        await this.loadData();
      } catch (error) {
        console.error('Owner accrual initialization failed:', error);
        this.renderError('The owner accrual report could not be initialized. Please refresh and try again.');
      }
    },

    async showFromMonthly() {
      const monthly = window.App;
      if (monthly) {
        this.selectedOwnerId = monthly.selectedOwnerId || this.selectedOwnerId;
        const now = new Date();
        const focusedYear = Number(monthly.currentYear);
        const focusedMonth = Number(monthly.currentMonth);
        const difference = (now.getFullYear() - focusedYear) * 12 + (now.getMonth() - focusedMonth);
        this.monthOffset = Math.max(0, difference);
      }
      if (!this.initialized) {
        await this.init();
        return;
      }
      if (!this.owners.some(owner => String(owner.id) === String(this.selectedOwnerId))) {
        this.selectedOwnerId = this.owners[0]?.id || '';
      }
      const ownerSelect = document.getElementById('accrual-owner-filter');
      if (this.selectedOwnerId) ownerSelect.value = this.selectedOwnerId;
      await this.loadData();
    },

    async showMonthlyFromAccrual() {
      if (!this.initialized || !window.App) return;
      const monthly = window.App;
      monthly.selectedOwnerId = this.selectedOwnerId || monthly.selectedOwnerId;
      const focus = new Date();
      focus.setDate(1);
      focus.setMonth(focus.getMonth() - this.monthOffset);
      monthly.currentYear = focus.getFullYear();
      monthly.currentMonth = focus.getMonth();
      const ownerSelect = document.getElementById('owner-filter');
      if ([...ownerSelect.options].some(option => String(option.value) === String(monthly.selectedOwnerId))) {
        ownerSelect.value = monthly.selectedOwnerId;
      }
      await monthly.loadData();
    },

    async loadOptions() {
      const sb = window.BKAuth.sb;
      const [employeesResult, accountsResult, assignmentsResult] = await Promise.all([
        sb.from('employees').select('id,first_name,last_name,assignment').eq('company_id', this.companyId).order('first_name').limit(500),
        sb.from('journal_accounts').select('id,name').eq('company_id', this.companyId).order('name').limit(1000),
        sb.from('global_settings').select('value').eq('key', 'journal_account_employee_assignments').eq('company_id', this.companyId).maybeSingle()
      ]);
      if (employeesResult.error) throw employeesResult.error;
      if (accountsResult.error) throw accountsResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;
      this.owners = (employeesResult.data || []).filter(employee => String(employee.assignment || '').toLowerCase().split(',').some(value => value.trim().includes('owner')));
      this.accounts = (accountsResult.data || []).filter(account => this.accountType(account.name));
      this.assignments = assignmentsResult.data?.value?.assignments || {};
      this.selectedOwnerId = this.owners.some(owner => String(owner.id) === String(this.selectedOwnerId))
        ? this.selectedOwnerId : (this.owners[0]?.id || '');
      const select = document.getElementById('accrual-owner-filter');
      select.disabled = !this.owners.length;
      select.innerHTML = this.owners.length
        ? this.owners.map(owner => `<option value="${esc(owner.id)}"${String(owner.id) === String(this.selectedOwnerId) ? ' selected' : ''}>${esc(`${owner.first_name || ''} ${owner.last_name || ''}`.trim())}</option>`).join('')
        : '<option value="" disabled selected>No owners found</option>';
    },

    accountType(name) {
      const value = String(name || '').toLowerCase();
      if (value.includes('company loan repayment') || value.includes('loan repayment')) return 'company_loan_repayment';
      if (value.includes('due from owner')) return 'due_from';
      if (value.includes('company loan')) return 'company_loan';
      if (value.includes('owner loan')) return 'owner_loan';
      if (value.includes('survival')) return 'survival';
      return '';
    },

    assignedAccounts() {
      return this.accounts.filter(account => String(this.assignments[String(account.id)] || '') === String(this.selectedOwnerId));
    },

    async changeOwner(ownerId) {
      this.selectedOwnerId = ownerId || '';
      this.monthOffset = 0;
      this.earliestMonth = null;
      await this.loadData();
    },

    async changeFocusMonth(delta) {
      const next = Math.max(0, this.monthOffset + delta);
      if (next === this.monthOffset) return;
      this.monthOffset = next;
      await this.loadData();
    },

    buildMonths() {
      const latest = new Date();
      latest.setDate(1);
      latest.setMonth(latest.getMonth() - this.monthOffset);
      this.months = Array.from({ length: VISIBLE_MONTHS }, (_, index) => monthMeta(new Date(latest.getFullYear(), latest.getMonth() - index, 1))).reverse();
    },

    async loadEarliestMonth() {
      if (this.earliestMonth !== null) return;
      const { data, error } = await window.BKAuth.sb.from('general_journal').select('date')
        .eq('company_id', this.companyId).order('date', { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      this.earliestMonth = data?.date ? String(data.date).slice(0, 7) : '';
      this.calculationStart = this.earliestMonth && this.earliestMonth > ABSOLUTE_START_MONTH
        ? this.earliestMonth : ABSOLUTE_START_MONTH;
    },

    async loadData() {
      if (!this.companyId || !this.selectedOwnerId) {
        this.renderError('No employees with an Owner assignment were found.');
        return;
      }
      this.renderLoading();
      const assigned = this.assignedAccounts();
      if (!assigned.length) {
        this.renderError('This owner has no assigned accrual accounts. Assign one under Assign Account.');
        return;
      }
      try {
        await this.loadEarliestMonth();
        this.buildMonths();
        const keys = this.months.map(month => month.key);
        const sb = window.BKAuth.sb;
        const newestKey = this.months.at(-1).key;
        const oldestActive = this.months.find(month => month.key >= this.calculationStart)?.key || '';
        let baseline = null;
        if (oldestActive && oldestActive > this.calculationStart) {
          const { data: baselineRows, error: baselineError } = await sb.from('locked_owner_accrual_statements')
            .select('month,statement_data').eq('company_id', this.companyId).eq('owner_id', this.selectedOwnerId)
            .gte('month', this.calculationStart).lte('month', oldestActive).order('month', { ascending: false }).limit(20);
          if (baselineError) throw baselineError;
          baseline = (baselineRows || []).find(row => row.statement_data?.formula_version === FORMULA_VERSION
            && Number.isFinite(Number(row.statement_data?.closing_total))) || null;
        }
        const calculationFirstMonth = baseline ? followingMonth(baseline.month) : this.calculationStart;
        const calculationKeys = monthSequence(calculationFirstMonth, newestKey);
        this.calculationLimited = calculationKeys.length > MAX_CALCULATION_MONTHS;
        const activeDisplayKeys = keys.filter(key => key >= this.calculationStart);
        const requestedKeys = this.calculationLimited ? activeDisplayKeys : [...new Set([...calculationKeys, ...activeDisplayKeys])];
        let lockRows = [];
        if (requestedKeys.length) {
          const { data, error } = await sb.from('locked_owner_accrual_statements').select('month,statement_data')
            .eq('company_id', this.companyId).eq('owner_id', this.selectedOwnerId).in('month', requestedKeys);
          if (error) throw error;
          lockRows = (data || []).filter(row => row.statement_data?.formula_version === FORMULA_VERSION);
        }
        const lockMap = new Map(lockRows.map(row => [row.month, row]));
        this.locked = keys.map(key => lockMap.get(key)).filter(Boolean);
        this.values = {};
        this.closingTotals = {};
        lockRows.forEach(row => { this.values[row.month] = row.statement_data?.values || {}; });
        const valueKeys = this.calculationLimited ? activeDisplayKeys : calculationKeys;
        const unlockedKeys = valueKeys.filter(key => !lockMap.has(key));
        unlockedKeys.forEach(key => { this.values[key] = {}; });
        if (unlockedKeys.length) {
          const { data: totals, error: totalsError } = await sb.rpc('get_owner_accrual_monthly_totals', {
            p_company_id: this.companyId,
            p_owner_id: this.selectedOwnerId,
            p_months: unlockedKeys
          });
          if (totalsError) throw totalsError;
          (totals || []).forEach(row => {
            if (!this.values[row.month]) this.values[row.month] = {};
            this.values[row.month][row.account_type] = Number(row.net_total) || 0;
          });
        }
        if (!this.calculationLimited) {
          let closing = baseline ? Number(baseline.statement_data.closing_total) || 0 : 0;
          if (baseline) this.closingTotals[baseline.month] = closing;
          calculationKeys.forEach(key => {
            const lockedRow = lockMap.get(key);
            const lockedClosing = Number(lockedRow?.statement_data?.closing_total);
            if (lockedRow && Number.isFinite(lockedClosing)) closing = lockedClosing;
            else closing += this.monthMovement(this.values[key]);
            this.closingTotals[key] = closing;
          });
        } else {
          this.locked.forEach(row => {
            const lockedClosing = Number(row.statement_data?.closing_total);
            if (Number.isFinite(lockedClosing)) this.closingTotals[row.month] = lockedClosing;
          });
        }
        this.render();
      } catch (error) {
        console.error('Owner accrual load failed:', error);
        this.renderError('The owner accrual report could not be loaded. Please refresh and try again.');
      }
    },

    monthMovement(values = {}) {
      return REPORT_ROWS.reduce((sum, [key]) => sum + (Number(values[key]) || 0), 0);
    },

    toggleLockMode() {
      this.lockMode = !this.lockMode;
      this.render();
    },

    async lockMonth(key) {
      const values = this.values[key] || {};
      const closingTotal = this.closingTotals[key];
      if (!Number.isFinite(closingTotal)) {
        toast('Calculation Limit. Lock an earlier calculated month first, then continue forward.', 'error');
        return;
      }
      const { error } = await window.BKAuth.sb.from('locked_owner_accrual_statements').upsert({
        company_id: this.companyId,
        owner_id: this.selectedOwnerId,
        month: key,
        statement_data: { values, closing_total: closingTotal, formula_version: FORMULA_VERSION },
        updated_at: new Date().toISOString()
      }, { onConflict: 'company_id,owner_id,month' });
      if (error) { console.error(error); toast('Could not lock this month. Please try again.', 'error'); return; }
      toast(`Locked ${key} successfully.`);
      await this.loadData();
    },

    async unlockMonth(key) {
      const { error } = await window.BKAuth.sb.from('locked_owner_accrual_statements').delete()
        .eq('company_id', this.companyId).eq('owner_id', this.selectedOwnerId).eq('month', key);
      if (error) { console.error(error); toast('Could not unlock this month. Please try again.', 'error'); return; }
      toast(`Unlocked ${key} successfully.`);
      await this.loadData();
    },

    render() {
      const head = document.getElementById('accrual-table-head');
      const lockedKeys = new Set(this.locked.map(row => row.month));
      const actionRow = this.lockMode ? `<tr class="accrual-actions"><th></th>${this.months.map(month => {
        const locked = lockedKeys.has(month.key);
        const beforeStart = month.key < this.calculationStart;
        const canLock = Number.isFinite(this.closingTotals[month.key]);
        const classes = [locked ? 'is-locked' : '', beforeStart ? 'is-prestart' : ''].filter(Boolean).join(' ');
        if (beforeStart) return `<th class="${classes}"><button type="button" class="btn btn-outline btn-sm" style="width:100%;" disabled>—</button></th>`;
        if (!locked && !canLock) return `<th class="${classes}"><button type="button" class="btn btn-outline btn-sm" style="width:100%;" disabled title="Calculation Limit">Limit</button></th>`;
        return `<th class="${classes}"><button type="button" class="btn ${locked ? 'btn-cyan' : 'btn-outline'} btn-sm" style="width:100%;" onclick="OwnerAccrualApp.${locked ? 'unlockMonth' : 'lockMonth'}('${month.key}')">${locked ? 'Locked' : 'Lock'}</button></th>`;
      }).join('')}</tr>` : '';
      head.innerHTML = `${actionRow}<tr><th>Account Type</th>${this.months.map(month => {
        const classes = [lockedKeys.has(month.key) ? 'is-locked' : '', month.key < this.calculationStart ? 'is-prestart' : ''].filter(Boolean).join(' ');
        return `<th class="${classes}">${esc(month.label)}</th>`;
      }).join('')}</tr>`;
      const rows = REPORT_ROWS.map(([key, label]) => `<tr><td>${esc(label)}</td>${this.months.map(month => {
        const beforeStart = month.key < this.calculationStart;
        const classes = [lockedKeys.has(month.key) ? 'is-locked' : '', beforeStart ? 'is-prestart' : ''].filter(Boolean).join(' ');
        return `<td class="${classes}">${beforeStart ? '—' : money(this.values[month.key]?.[key])}</td>`;
      }).join('')}</tr>`).join('');
      const totalCells = this.months.map(month => {
        const beforeStart = month.key < this.calculationStart;
        const classes = [lockedKeys.has(month.key) ? 'is-locked' : '', beforeStart ? 'is-prestart' : ''].filter(Boolean).join(' ');
        if (beforeStart) return `<td class="${classes}">—</td>`;
        const closing = this.closingTotals[month.key];
        return `<td class="${classes}">${Number.isFinite(closing) ? money(closing) : '<span class="calculation-limit">Calculation Limit</span>'}</td>`;
      }).join('');
      document.getElementById('accrual-table-body').innerHTML = `${rows}<tr class="total-row"><td>Total</td>${totalCells}</tr>`;
      const newest = this.months.at(-1);
      document.getElementById('accrual-range').textContent = newest.label;
      document.getElementById('accrual-newer').disabled = this.monthOffset === 0;
      document.getElementById('accrual-older').disabled = newest.key <= this.calculationStart;
      const lockButton = document.getElementById('accrual-lock-mode');
      lockButton.style.background = this.lockMode ? 'var(--cyan)' : '';
      lockButton.style.color = this.lockMode ? '#fff' : '';
      lockButton.style.borderColor = this.lockMode ? 'var(--cyan)' : '';
    },

    renderLoading() {
      document.getElementById('accrual-table-head').innerHTML = `<tr><th>Account Type</th><th colspan="${VISIBLE_MONTHS}">Loading accrual data...</th></tr>`;
      document.getElementById('accrual-table-body').innerHTML = `<tr><td colspan="${VISIBLE_MONTHS + 1}" class="accrual-empty">Loading...</td></tr>`;
    },

    renderError(message) {
      document.getElementById('accrual-table-head').innerHTML = `<tr><th>Account Type</th><th colspan="${VISIBLE_MONTHS}">Accrual</th></tr>`;
      document.getElementById('accrual-table-body').innerHTML = `<tr><td colspan="${VISIBLE_MONTHS + 1}" class="accrual-empty">${esc(message)}</td></tr>`;
    }
  };
})();
