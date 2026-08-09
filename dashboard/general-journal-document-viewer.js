(function () {
  'use strict';

  const viewer = {
    bound: false,

    bind() {
      if (this.bound) return;
      const overlay = document.getElementById('document-viewer-overlay');
      const closeButton = document.getElementById('document-viewer-close');
      if (!overlay || !closeButton) return;
      this.bound = true;

      closeButton.addEventListener('click', () => this.close());
      overlay.addEventListener('click', event => {
        if (event.target === overlay) this.close();
      });
      document.addEventListener('click', event => {
        const trigger = event.target.closest('.attachment-view-btn');
        if (!trigger) return;
        this.open(trigger.dataset.documentUrl, trigger.dataset.documentType);
      });
      document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && overlay.classList.contains('open')) this.close();
      });
    },

    open(url, type) {
      if (!url) return;
      const overlay = document.getElementById('document-viewer-overlay');
      const stage = document.getElementById('document-viewer-stage');
      const title = document.getElementById('document-viewer-title');
      stage.replaceChildren();

      if (type === 'pdf') {
        const frame = document.createElement('iframe');
        frame.className = 'document-viewer__pdf';
        frame.src = url;
        frame.title = 'Attached PDF document';
        stage.appendChild(frame);
        title.textContent = 'Attached PDF';
      } else {
        const image = document.createElement('img');
        image.className = 'document-viewer__image';
        image.src = url;
        image.alt = 'Attached journal document';
        stage.appendChild(image);
        title.textContent = 'Attached Image';
      }

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      document.getElementById('document-viewer-close').focus();
    },

    close() {
      const overlay = document.getElementById('document-viewer-overlay');
      overlay.classList.remove('open');
      document.getElementById('document-viewer-stage').replaceChildren();
      document.body.style.overflow = '';
    }
  };

  window.JournalDocumentViewer = viewer;
})();

window.JournalSummary = {
  async load({ app, filters, dateFrom, dateTo, snapshotEntryNumbers, snapshotMonths, parseEntry }) {
    const cleanedSearch = String(filters.search || '').replace(/,/g, '');
    const parsedSearchNumber = cleanedSearch === '' ? NaN : Number(cleanedSearch);
    const { data, error } = await window.BKAuth.sb.rpc('get_general_journal_summary', {
      p_company_id: app.companyId,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_year: (!dateFrom && !dateTo && filters.year) ? Number(filters.year) : null,
      p_month: (!dateFrom && !dateTo && filters.month) ? Number(filters.month) : null,
      p_accounts: filters.selectedAccounts?.size ? [...filters.selectedAccounts] : null,
      p_search: filters.search || null,
      p_search_entry_number: filters.search ? parseEntry(filters.search) : null,
      p_search_number: Number.isFinite(parsedSearchNumber) ? parsedSearchNumber : null,
      p_search_is_integer: Number.isInteger(parsedSearchNumber),
      p_snapshot_entry_numbers: snapshotEntryNumbers?.length ? snapshotEntryNumbers : null,
      p_snapshot_months: snapshotMonths?.length ? snapshotMonths : null
    });
    if (error) throw error;
    const summary = data?.[0] || {};
    return {
      sumDebit: Number(summary.sum_debit || 0),
      sumCredit: Number(summary.sum_credit || 0),
      rowCount: Number(summary.row_count || 0)
    };
  }
};
