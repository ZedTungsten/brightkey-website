    'use strict';

    const PAYMENT_LEDGER_DEFAULT_ROWS = 2;
    let paymentLedgerBookingId = null;
    let paymentLedgerRows = [];
    let paymentLedgerSaveTimer = null;

    function parsePaymentLedger(value) {
      let parsed = value;
      if (typeof value === 'string') {
        try { parsed = JSON.parse(value); } catch (_) { parsed = []; }
      }
      return Array.isArray(parsed) ? parsed.map(entry => ({
        amount: Math.max(0, Math.round(Number(entry?.amount) || 0)),
        channel: String(entry?.channel || '').slice(0, 120),
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(entry?.date || '')) ? String(entry.date) : null
      })) : [];
    }

    function paymentLedgerToday() {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    function formatPaymentLedgerAmount(cents) {
      return (Number(cents || 0) / 100).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    function parsePaymentLedgerAmount(value) {
      const amount = Number.parseFloat(String(value || '').replace(/,/g, '').trim());
      return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
    }

    function getPaymentLedgerDepositCents(booking) {
      const storedDepositCents = Math.max(0, Math.round(Number(booking?.deposit_amount) || 0));
      if (storedDepositCents > 0) return storedDepositCents;
      const labels = String(booking?.deduction_labels || '').split('|').map(value => value.trim());
      const values = String(booking?.deduction_values || '').split('|').map(value => value.trim());
      return labels.reduce((sum, label, index) => (
        /^deposit$/i.test(label) ? sum + parsePaymentLedgerAmount(values[index]) : sum
      ), 0);
    }

    function formatPaymentLedgerDate(value) {
      if (!value) return '—';
      const date = new Date(`${value}T00:00:00`);
      return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-US', {
        month: 'short', day: '2-digit', year: 'numeric'
      });
    }

    function updatePaymentLedgerTotal() {
      const total = document.getElementById('payment-ledger-total');
      if (!total || !selectedBooking) return;
      const paidCents = paymentLedgerRows.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
      const depositCents = getPaymentLedgerDepositCents(selectedBooking);
      const originalTotalCents = (Number(selectedBooking.grand_total) || 0) + depositCents;
      const remainingCents = originalTotalCents - paidCents;
      total.textContent = formatPaymentLedgerAmount(remainingCents);
      total.classList.toggle('is-paid', remainingCents <= 0);
      document.getElementById('det-total')?.classList.toggle('is-paid', remainingCents <= 0);
    }

    async function savePaymentLedger() {
      if (!selectedBooking || selectedBooking.id !== paymentLedgerBookingId) return;
      const ledger = paymentLedgerRows
        .filter(entry => entry.amount > 0 || entry.channel.trim())
        .map(entry => ({ amount: entry.amount, channel: entry.channel.trim(), date: entry.amount > 0 ? entry.date : null }));
      const { error } = await sb
        .from('installation_bookings')
        .update({ payment_ledger: ledger })
        .eq('id', selectedBooking.id)
        .eq('company_id', currentCompanyId);
      if (error) {
        console.error('Could not save payment ledger:', error.message);
        showToast('Payment ledger could not be saved. Please try again.', true);
        return;
      }
      selectedBooking.payment_ledger = ledger;
      const booking = dbBookings.find(item => item.id === selectedBooking.id);
      if (booking) booking.payment_ledger = ledger;
    }

    function schedulePaymentLedgerSave() {
      clearTimeout(paymentLedgerSaveTimer);
      paymentLedgerSaveTimer = setTimeout(() => savePaymentLedger().catch(console.error), 500);
    }

    function createPaymentLedgerRow(entry, index) {
      const row = document.createElement('tr');
      const amountCell = document.createElement('td');
      const amountInput = document.createElement('input');
      amountInput.type = 'text';
      amountInput.inputMode = 'decimal';
      amountInput.setAttribute('aria-label', `Payment amount ${index + 1}`);
      amountInput.value = entry.amount ? formatPaymentLedgerAmount(entry.amount) : '';
      amountInput.addEventListener('focus', () => {
        amountInput.value = entry.amount ? (entry.amount / 100).toFixed(2) : '';
      });
      amountInput.addEventListener('input', () => {
        entry.amount = parsePaymentLedgerAmount(amountInput.value);
        if (entry.amount > 0 && !entry.date) entry.date = paymentLedgerToday();
        if (!entry.amount) entry.date = null;
        row.querySelector('.booking-payment-ledger-date').textContent = formatPaymentLedgerDate(entry.date);
        updatePaymentLedgerTotal();
        schedulePaymentLedgerSave();
      });
      amountInput.addEventListener('blur', () => {
        amountInput.value = entry.amount ? formatPaymentLedgerAmount(entry.amount) : '';
      });
      amountCell.appendChild(amountInput);

      const channelCell = document.createElement('td');
      const channelInput = document.createElement('input');
      channelInput.type = 'text';
      channelInput.maxLength = 120;
      channelInput.setAttribute('aria-label', `Payment channel ${index + 1}`);
      channelInput.value = entry.channel;
      channelInput.addEventListener('input', () => {
        entry.channel = channelInput.value;
        schedulePaymentLedgerSave();
      });
      channelCell.appendChild(channelInput);

      const dateCell = document.createElement('td');
      dateCell.className = 'booking-payment-ledger-date';
      dateCell.textContent = formatPaymentLedgerDate(entry.date);
      row.append(amountCell, channelCell, dateCell);
      return row;
    }

    function drawPaymentLedgerRows() {
      const body = document.getElementById('payment-ledger-body');
      if (!body) return;
      body.replaceChildren(...paymentLedgerRows.map(createPaymentLedgerRow));
      const deleteButton = document.getElementById('payment-ledger-delete-row');
      if (deleteButton) deleteButton.disabled = paymentLedgerRows.length === 0;
      updatePaymentLedgerTotal();
    }

    function togglePaymentLedgerDeleteDialog(show) {
      const dialog = document.getElementById('payment-ledger-delete-dialog');
      if (!dialog) return;
      dialog.classList.toggle('open', show);
      dialog.setAttribute('aria-hidden', String(!show));
      if (show) document.getElementById('payment-ledger-delete-dialog-okay')?.focus();
    }

    window.renderBookingPaymentLedger = function(booking) {
      clearTimeout(paymentLedgerSaveTimer);
      paymentLedgerBookingId = booking?.id || null;
      paymentLedgerRows = parsePaymentLedger(booking?.payment_ledger);
      while (paymentLedgerRows.length < PAYMENT_LEDGER_DEFAULT_ROWS) {
        paymentLedgerRows.push({ amount: 0, channel: '', date: null });
      }
      drawPaymentLedgerRows();
    };

    document.getElementById('payment-ledger-add-row')?.addEventListener('click', () => {
      paymentLedgerRows.push({ amount: 0, channel: '', date: null });
      drawPaymentLedgerRows();
      document.querySelector('#payment-ledger-body tr:last-child input')?.focus();
    });

    document.getElementById('payment-ledger-delete-row')?.addEventListener('click', () => {
      const lastRow = paymentLedgerRows.at(-1);
      if (!lastRow) return;
      if (lastRow.amount > 0 || lastRow.channel.trim()) {
        togglePaymentLedgerDeleteDialog(true);
        return;
      }
      paymentLedgerRows.pop();
      drawPaymentLedgerRows();
    });

    document.getElementById('payment-ledger-delete-dialog-okay')?.addEventListener('click', () => {
      togglePaymentLedgerDeleteDialog(false);
      document.getElementById('payment-ledger-delete-row')?.focus();
    });

    document.getElementById('payment-ledger-delete-dialog')?.addEventListener('click', event => {
      if (event.target === event.currentTarget) togglePaymentLedgerDeleteDialog(false);
    });
