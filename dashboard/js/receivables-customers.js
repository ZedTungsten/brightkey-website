'use strict';

const ReceivablesApp = {
  sb: null,
  tenantId: null,
  companyId: null,
  selectedMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  rows: [],
  filteredRows: [],
  activeBooking: null,
  activeEntryType: 'payment',
  activeEntry: null,
  journalMatch: null,
  journalTimer: null,
  editMode: false,
  pendingEntries: [],
  editSnapshot: null,

  async init() {
    try {
      const auth = await window.BKAuth.checkRoleGate(['Owner', 'Admin', 'Finance'], '../../admin.html');
      if (!auth?.tenantId) return;
      this.sb = window.BKAuth.sb;
      this.tenantId = auth.tenantId;
      const { data: company, error } = await this.sb.from('companies').select('id').eq('tenant_id', this.tenantId).limit(1).maybeSingle();
      if (error) throw error;
      this.companyId = company?.id || null;
      if (!this.companyId) throw new Error('Company access could not be resolved.');
      this.bindEvents();
      await this.loadData();
    } catch (error) {
      console.error('Receivables initialization failed:', error);
      this.showTableMessage('Customer receivables could not be loaded. Please refresh and try again.');
    }
  },

  bindEvents() {
    document.getElementById('previous-month').addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => this.changeMonth(1));
    document.getElementById('search-input').addEventListener('input', () => this.applyFilters());
    document.getElementById('status-filter').addEventListener('change', () => this.applyFilters());
    document.getElementById('toggle-entry-mode').addEventListener('click', () => this.editMode ? this.saveDraftEntries() : this.beginEntryMode());
    document.getElementById('cancel-entry-mode').addEventListener('click', () => this.cancelEntryMode());
    document.getElementById('entry-form').addEventListener('submit', event => this.saveEntry(event));
    document.getElementById('delete-entry').addEventListener('click', () => this.deleteEntry());
    document.getElementById('entry-number').addEventListener('input', event => this.scheduleJournalLookup(event.target.value));
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => this.closeModal(button.dataset.close)));
    document.querySelectorAll('.modal-overlay').forEach(modal => modal.addEventListener('click', event => {
      if (event.target === modal) this.closeModal(modal.id);
    }));
  },

  async changeMonth(offset) {
    this.selectedMonth = new Date(this.selectedMonth.getFullYear(), this.selectedMonth.getMonth() + offset, 1);
    await this.loadData();
  },

  monthBounds() {
    const year = this.selectedMonth.getFullYear();
    const month = this.selectedMonth.getMonth();
    const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const next = new Date(year, month + 1, 1);
    const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
    return { start, end };
  },

  async loadData() {
    this.renderMonth();
    this.showLoading();
    try {
      const { start, end } = this.monthBounds();
      const { data: bookings, error: bookingError } = await this.sb
        .from('installation_bookings')
        .select('id,created_at,scheduled_date,order_no,customer_name,grand_total,balance_due,deposit_amount,deduction_labels,deduction_values,status')
        .eq('company_id', this.companyId)
        .gte('scheduled_date', start)
        .lt('scheduled_date', end)
        .neq('status', 'cancelled')
        .not('order_no', 'ilike', 'DO-%')
        .order('scheduled_date', { ascending: true })
        .limit(500);
      if (bookingError) throw bookingError;

      const receivableBookings = (bookings || []).filter(booking => !String(booking.order_no || '').toUpperCase().startsWith('DO-'));
      const bookingIds = receivableBookings.map(row => row.id).filter(Boolean);
      let payments = [];
      if (bookingIds.length) {
        const { data, error } = await this.sb
          .from('receivable_payments')
          .select('id,booking_id,amount_cents,payment_date,payment_method,reference_number,transaction_type,journal_entry_id,journal_entry_number,debited_account,notes,created_at')
          .eq('company_id', this.companyId)
          .in('booking_id', bookingIds)
          .not('journal_entry_number', 'is', null)
          .order('payment_date', { ascending: true })
          .limit(1000);
        if (error) throw error;
        payments = data || [];
      }

      const paymentMap = new Map();
      payments.forEach(payment => {
        if (!paymentMap.has(payment.booking_id)) paymentMap.set(payment.booking_id, []);
        paymentMap.get(payment.booking_id).push(payment);
      });
      this.rows = receivableBookings.map(booking => this.mapBooking(booking, paymentMap.get(booking.id) || []));
      this.applyFilters();
    } catch (error) {
      console.error('Receivables load failed:', error);
      this.showTableMessage('Customer receivables could not be loaded. Please refresh and try again.');
      window.Toast?.show('Customer receivables could not be loaded. Please refresh and try again.', 'error');
    }
  },

  mapBooking(booking, entries) {
    const baseDeposit = this.resolveDeposit(booking);
    const addedDeposits = entries.filter(entry => entry.transaction_type === 'deposit');
    const payments = entries.filter(entry => entry.transaction_type !== 'deposit');
    const addedDepositTotal = addedDeposits.reduce((sum, entry) => sum + this.toCents(entry.amount_cents), 0);
    const paymentTotal = payments.reduce((sum, entry) => sum + this.toCents(entry.amount_cents), 0);
    const storedGrand = this.toCents(booking.grand_total);
    const contractAmount = storedGrand + Math.abs(baseDeposit);
    const collected = Math.min(contractAmount, baseDeposit + addedDepositTotal + paymentTotal);
    const balanceDue = Math.max(0, contractAmount - collected);
    const status = contractAmount > 0 && collected >= contractAmount ? 'paid' : collected > 0 ? 'partial' : 'unpaid';
    const initialDeposit = baseDeposit > 0 ? [{
      id: `booking-${booking.id}`,
      amount_cents: baseDeposit,
      payment_date: String(booking.created_at || '').slice(0, 10),
      debited_account: null,
      reference_number: null,
      is_initial: true
    }] : [];
    return {
      id: booking.id,
      orderNumber: booking.order_no || '—',
      name: booking.customer_name || '—',
      orderDate: String(booking.created_at || '').slice(0, 10),
      installDate: booking.scheduled_date,
      contractAmount,
      collected,
      balanceDue,
      status,
      deposits: [...initialDeposit, ...addedDeposits],
      payments
    };
  },

  resolveDeposit(booking) {
    let total = Math.abs(this.toCents(booking.deposit_amount));
    const labels = Array.isArray(booking.deduction_labels)
      ? booking.deduction_labels
      : String(booking.deduction_labels || '').split('|');
    const values = Array.isArray(booking.deduction_values)
      ? booking.deduction_values
      : String(booking.deduction_values || '').split('|');
    labels.forEach((label, index) => {
      if (String(label).toLowerCase().includes('deposit')) total += Math.abs(Math.round((Number(values[index]) || 0) * 100));
    });
    return total;
  },

  applyFilters() {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    const status = document.getElementById('status-filter').value;
    this.filteredRows = this.rows.filter(row => {
      if (status !== 'all' && row.status !== status) return false;
      if (!query) return true;
      return `${row.orderNumber} ${row.name} ${this.formatMoney(row.contractAmount)}`.toLowerCase().includes(query);
    });
    this.renderMetrics();
    this.renderTable();
  },

  renderMonth() {
    document.getElementById('selected-month').textContent = this.selectedMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  },

  renderMetrics() {
    const totals = this.rows.reduce((result, row) => {
      result.contract += row.contractAmount;
      result.collected += row.collected;
      result.outstanding += row.balanceDue;
      if (row.status !== 'paid') result.open += 1;
      return result;
    }, { contract: 0, collected: 0, outstanding: 0, open: 0 });
    document.getElementById('metric-contract').textContent = this.formatMoney(totals.contract);
    document.getElementById('metric-collected').textContent = this.formatMoney(totals.collected);
    document.getElementById('metric-outstanding').textContent = this.formatMoney(totals.outstanding);
    document.getElementById('metric-open').textContent = totals.open.toLocaleString();
  },

  renderTable() {
    const body = document.getElementById('receivables-body');
    if (!this.filteredRows.length) {
      body.innerHTML = '<tr><td colspan="9"><div class="empty-state">No orders with an installation date in this month.</div></td></tr>';
      return;
    }
    body.innerHTML = this.filteredRows.map(row => `
      <tr>
        <td><span class="order-link">${this.escape(row.orderNumber)}</span></td>
        <td><strong>${this.escape(row.name)}</strong></td>
        <td>${this.formatDate(row.orderDate)}</td>
        <td>${this.formatDate(row.installDate)}</td>
        <td class="money contract-value"><strong>${this.formatMoney(row.contractAmount)}</strong></td>
        <td class="money balance-value${row.balanceDue === 0 ? ' balance-settled' : ''}"><strong>${this.formatMoney(row.balanceDue)}</strong></td>
        <td class="ledger-cell">${this.renderEntries(row, 'deposit')}${this.editMode ? `<button class="add-entry" onclick="ReceivablesApp.openEntryModal('${row.id}','deposit')">+ Add Entries</button>` : ''}</td>
        <td class="ledger-cell">${this.renderEntries(row, 'payment')}${this.editMode ? `<button class="add-entry" onclick="ReceivablesApp.openEntryModal('${row.id}','payment')">+ Add Entries</button>` : ''}</td>
        <td><span class="status-pill status-${row.status}">${this.titleCase(row.status)}</span></td>
      </tr>`).join('');
  },

  renderEntries(row, type) {
    const entries = type === 'deposit' ? row.deposits : row.payments;
    if (!entries.length) return this.editMode ? '' : '<span class="empty-ledger-value">—</span>';
    return entries.map(entry => `<div class="ledger-entry">${this.editMode && !entry.is_initial ? `<button type="button" class="entry-edit" aria-label="Edit entry" title="Edit entry" onclick="ReceivablesApp.openEditEntryModal('${row.id}','${type}','${entry.id}')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>` : '<span class="entry-edit-spacer"></span>'}<strong class="ledger-amount">${this.formatMoney(this.toCents(entry.amount_cents))}</strong><span class="ledger-date">${this.formatShortDate(entry.payment_date)}</span><span class="account-name">${this.escape(entry.debited_account || 'Not connected')}</span></div>`).join('');
  },

  beginEntryMode() {
    this.editSnapshot = JSON.parse(JSON.stringify(this.rows));
    this.pendingEntries = [];
    this.editMode = true;
    this.updateEntryModeControls();
    this.renderTable();
  },

  cancelEntryMode() {
    if (!this.editMode) return;
    this.rows = this.editSnapshot || this.rows;
    this.pendingEntries = [];
    this.editSnapshot = null;
    this.editMode = false;
    this.updateEntryModeControls();
    this.applyFilters();
  },

  updateEntryModeControls(saving = false) {
    const primary = document.getElementById('toggle-entry-mode');
    const cancel = document.getElementById('cancel-entry-mode');
    primary.textContent = this.editMode ? (saving ? 'Saving...' : 'Save') : 'Add Entries';
    primary.classList.toggle('btn-success', this.editMode);
    primary.classList.toggle('btn-cyan', !this.editMode);
    primary.disabled = saving;
    cancel.hidden = !this.editMode;
    cancel.disabled = saving;
  },

  openEntryModal(bookingId, type) {
    this.activeBooking = this.rows.find(row => row.id === bookingId) || null;
    if (!this.activeBooking) return;
    this.activeEntryType = type;
    this.activeEntry = null;
    this.journalMatch = null;
    document.getElementById('entry-modal-title').textContent = type === 'deposit' ? 'Add Deposit' : 'Add Payment';
    document.getElementById('entry-modal-context').textContent = `${this.activeBooking.orderNumber} — ${this.activeBooking.name}`;
    document.getElementById('entry-form').reset();
    document.getElementById('delete-entry').hidden = true;
    document.getElementById('save-entry').textContent = 'Add Entry';
    document.getElementById('entry-details').innerHTML = '<span>Enter a valid journal entry number to load its details.</span>';
    document.getElementById('save-entry').disabled = true;
    this.openModal('entry-modal');
  },

  openEditEntryModal(bookingId, type, entryId) {
    this.activeBooking = this.rows.find(row => row.id === bookingId) || null;
    const entries = type === 'deposit' ? this.activeBooking?.deposits : this.activeBooking?.payments;
    this.activeEntry = entries?.find(entry => String(entry.id) === String(entryId)) || null;
    if (!this.activeBooking || !this.activeEntry || this.activeEntry.is_initial) return;
    this.activeEntryType = type;
    this.journalMatch = null;
    document.getElementById('entry-modal-title').textContent = type === 'deposit' ? 'Edit Deposit' : 'Edit Payment';
    document.getElementById('entry-modal-context').textContent = `${this.activeBooking.orderNumber} — ${this.activeBooking.name}`;
    document.getElementById('entry-form').reset();
    document.getElementById('entry-number').value = this.activeEntry.journal_entry_number || this.activeEntry.reference_number || '';
    document.getElementById('delete-entry').hidden = false;
    document.getElementById('save-entry').textContent = 'Edit Entry';
    document.getElementById('save-entry').disabled = true;
    this.openModal('entry-modal');
    this.scheduleJournalLookup(document.getElementById('entry-number').value);
  },

  scheduleJournalLookup(value) {
    clearTimeout(this.journalTimer);
    this.journalMatch = null;
    document.getElementById('save-entry').disabled = true;
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
      document.getElementById('entry-details').innerHTML = '<span>Enter a valid journal entry number to load its details.</span>';
      return;
    }
    document.getElementById('entry-details').innerHTML = '<div class="loading-state"><span class="loading-spinner"></span>Loading entry...</div>';
    this.journalTimer = setTimeout(() => this.lookupJournal(number), 300);
  },

  async lookupJournal(entryNumber) {
    try {
      const { data, error } = await this.sb.from('general_journal')
        .select('id,entry_number,date,debit,credit,account,description_1,description_2')
        .eq('company_id', this.companyId).eq('entry_number', entryNumber).order('id').limit(20);
      if (error) throw error;
      if (Number(document.getElementById('entry-number').value) !== entryNumber) return;
      if (!data?.length) {
        document.getElementById('entry-details').innerHTML = '<span>No journal entry was found for this company.</span>';
        return;
      }
      const debitRow = data.find(row => this.numericAmount(row.debit) > 0) || data[0];
      const creditRow = data.find(row => this.numericAmount(row.credit) > 0);
      const amount = data.reduce((sum, row) => sum + this.numericAmount(row.debit), 0);
      const description1 = this.displayValue(debitRow.description_1) || '—';
      const description2 = this.displayValue(debitRow.description_2) || '—';
      this.journalMatch = { id: debitRow.id, entryNumber, date: debitRow.date, amount, description1, description2, creditedAccount: this.displayValue(creditRow?.account) || '—', account: this.displayValue(debitRow.account) || '—' };
      document.getElementById('entry-details').innerHTML = `<div class="journal-detail-grid"><span>Credited Account</span><strong>${this.escape(this.journalMatch.creditedAccount)}</strong><span>Date</span><strong>${this.formatDate(this.journalMatch.date)}</strong><span>Description 1</span><strong>${this.escape(description1)}</strong><span>Description 2</span><strong>${this.escape(description2)}</strong><span>Amount Debited</span><strong>${this.formatMoney(Math.round(amount * 100))}</strong><span>Debited Account</span><strong>${this.escape(this.journalMatch.account)}</strong></div>`;
      document.getElementById('save-entry').disabled = false;
    } catch (error) {
      console.error('Journal lookup failed:', error);
      document.getElementById('entry-details').innerHTML = '<span>That journal entry could not be loaded. Please try again.</span>';
    }
  },

  saveEntry(event) {
    event.preventDefault();
    if (!this.activeBooking) return;
    if (!this.journalMatch) {
      window.Toast?.show('Enter a valid General Journal entry number before saving.', 'error');
      return;
    }
    const amountCents = Math.round(this.journalMatch.amount * 100);
    const paymentDate = String(this.journalMatch.date || '').slice(0, 10);
    const description = [this.journalMatch.description1, this.journalMatch.description2].filter(value => value && value !== '—').join(' — ');
    if (!Number.isInteger(amountCents) || amountCents <= 0 || !paymentDate) {
      window.Toast?.show('The selected journal entry must have a date and debited amount.', 'error');
      return;
    }
    const draft = {
      operation: this.activeEntry ? 'update' : 'insert',
      id: this.activeEntry && !String(this.activeEntry.id).startsWith('draft-') ? this.activeEntry.id : null,
      company_id: this.companyId,
      booking_id: this.activeBooking.id,
      amount_cents: amountCents,
      payment_date: paymentDate,
      payment_method: 'General Journal',
      reference_number: String(this.journalMatch.entryNumber),
      notes: description || null,
      transaction_type: this.activeEntryType,
      journal_entry_id: this.journalMatch.id,
      journal_entry_number: this.journalMatch.entryNumber,
      debited_account: this.journalMatch.account
    };
    const target = this.rows.find(row => row.id === this.activeBooking.id);
    if (target) {
      const collection = this.activeEntryType === 'deposit' ? target.deposits : target.payments;
      if (this.activeEntry) {
        const index = collection.findIndex(entry => String(entry.id) === String(this.activeEntry.id));
        if (String(this.activeEntry.id).startsWith('draft-')) {
          const pendingIndex = this.pendingEntries.findIndex(entry => entry.draft_id === this.activeEntry.id);
          const replacement = { ...draft, operation: 'insert', id: null, draft_id: this.activeEntry.id };
          if (pendingIndex >= 0) this.pendingEntries[pendingIndex] = replacement;
          if (index >= 0) collection[index] = { ...replacement, id: this.activeEntry.id };
        } else {
          this.upsertPendingOperation(draft);
          if (index >= 0) collection[index] = { ...draft, id: this.activeEntry.id };
        }
      } else {
        const draftId = `draft-${Date.now()}-${this.pendingEntries.length + 1}`;
        const insertDraft = { ...draft, draft_id: draftId };
        this.pendingEntries.push(insertDraft);
        collection.push({ ...insertDraft, id: draftId });
      }
      this.recalculateRow(target);
    }
    this.closeModal('entry-modal');
    this.applyFilters();
    window.Toast?.show(`${this.titleCase(this.activeEntryType)} ${this.activeEntry ? 'updated' : 'added'} in the draft. Click Save to apply changes.`, 'success');
  },

  deleteEntry() {
    if (!this.activeBooking || !this.activeEntry || this.activeEntry.is_initial) return;
    const target = this.rows.find(row => row.id === this.activeBooking.id);
    if (!target) return;
    const collection = this.activeEntryType === 'deposit' ? target.deposits : target.payments;
    const index = collection.findIndex(entry => String(entry.id) === String(this.activeEntry.id));
    if (index >= 0) collection.splice(index, 1);
    if (String(this.activeEntry.id).startsWith('draft-')) {
      this.pendingEntries = this.pendingEntries.filter(entry => entry.draft_id !== this.activeEntry.id);
    } else {
      this.upsertPendingOperation({ operation: 'delete', id: this.activeEntry.id, booking_id: target.id });
    }
    this.recalculateRow(target);
    this.closeModal('entry-modal');
    this.applyFilters();
    window.Toast?.show('Entry deleted from the draft. Click Save to apply changes.', 'success');
  },

  upsertPendingOperation(operation) {
    const index = this.pendingEntries.findIndex(entry => entry.id && String(entry.id) === String(operation.id));
    if (index >= 0) this.pendingEntries[index] = operation;
    else this.pendingEntries.push(operation);
  },

  recalculateRow(row) {
    const collected = [...row.deposits, ...row.payments].reduce((sum, entry) => sum + this.toCents(entry.amount_cents), 0);
    row.collected = Math.min(row.contractAmount, collected);
    row.balanceDue = Math.max(0, row.contractAmount - row.collected);
    row.status = row.contractAmount > 0 && row.collected >= row.contractAmount ? 'paid' : row.collected > 0 ? 'partial' : 'unpaid';
  },

  async saveDraftEntries() {
    if (!this.editMode) return;
    if (!this.pendingEntries.length) {
      this.editMode = false;
      this.editSnapshot = null;
      this.updateEntryModeControls();
      this.renderTable();
      return;
    }
    this.updateEntryModeControls(true);
    try {
      const { data, error } = await this.sb.rpc('save_receivable_entry_batch', {
        p_company_id: this.companyId,
        p_entries: this.pendingEntries
      });
      if (error) throw error;
      if (Number(data) !== this.pendingEntries.length) throw new Error('Not all draft entries were saved.');
      this.pendingEntries = [];
      this.editSnapshot = null;
      this.editMode = false;
      this.updateEntryModeControls();
      window.Toast?.show('Receivable entries saved successfully.', 'success');
      await this.loadData();
    } catch (error) {
      console.error('Receivable draft save failed:', error);
      this.updateEntryModeControls(false);
      window.Toast?.show('The receivable entries could not be saved. Your draft is still available.', 'error');
    }
  },

  openModal(id) {
    const modal = document.getElementById(id);
    modal.style.display = 'flex';
    modal.offsetHeight;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  },

  closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    setTimeout(() => { if (!modal.classList.contains('open')) modal.style.display = 'none'; }, 150);
  },

  showLoading() {
    document.getElementById('receivables-body').innerHTML = '<tr><td colspan="9"><div class="loading-state"><span class="loading-spinner"></span>Loading customer receivables...</div></td></tr>';
  },
  showTableMessage(message) { document.getElementById('receivables-body').innerHTML = `<tr><td colspan="9"><div class="empty-state">${this.escape(message)}</div></td></tr>`; },
  toCents(value) { const number = Number(value); return Number.isFinite(number) ? Math.round(number) : 0; },
  numericAmount(value) { if (typeof value === 'number') return value; if (value && typeof value === 'object') return Number(value.amount ?? value.value ?? 0) || 0; return Number(value) || 0; },
  displayValue(value) { if (value === null || value === undefined) return ''; if (typeof value === 'object') return String(value.name ?? value.label ?? value.description ?? value.value ?? ''); return String(value); },
  formatMoney(cents) { return `₱${(this.toCents(cents) / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; },
  formatDate(value) { if (!value) return '—'; const date = new Date(`${String(value).slice(0, 10)}T00:00:00`); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }); },
  formatShortDate(value) { if (!value) return '—'; const date = new Date(`${String(value).slice(0, 10)}T00:00:00`); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }); },
  titleCase(value) { return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1); },
  escape(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char])); }
};

window.ReceivablesApp = ReceivablesApp;
document.addEventListener('DOMContentLoaded', () => ReceivablesApp.init());
