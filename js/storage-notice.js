(function() {
  'use strict';

  const NOTICE_ID = 'bk-storage-notice';
  const STYLE_ID = 'bk-storage-notice-style';
  let activeRequest = null;
  let currentCompanyId = null;

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root { --bk-storage-notice-height: 42px; }
      #${NOTICE_ID} {
        position: fixed;
        inset: 0 0 auto 0;
        z-index: 99999;
        min-height: var(--bk-storage-notice-height);
        padding: 0.65rem 1rem;
        display: none;
        align-items: center;
        justify-content: center;
        background: #DC2626;
        color: #FFFFFF;
        font-family: var(--font, 'Commissioner', sans-serif);
        font-size: 0.84rem;
        font-weight: 500;
        line-height: 1.35;
        text-align: center;
        pointer-events: none;
      }
      #${NOTICE_ID}[data-status="full"] { color: #FDE047; }
      body.bk-storage-notice-active { padding-top: var(--bk-storage-notice-height) !important; }
      body.bk-storage-notice-active .dash-layout {
        min-height: calc(100vh - var(--bk-storage-notice-height)) !important;
        min-height: calc(100dvh - var(--bk-storage-notice-height)) !important;
      }
      body.bk-storage-notice-active .dash-sidebar {
        top: var(--bk-storage-notice-height) !important;
        height: calc(100vh - var(--bk-storage-notice-height)) !important;
        height: calc(100dvh - var(--bk-storage-notice-height)) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function getNotice() {
    let notice = document.getElementById(NOTICE_ID);
    if (notice) return notice;
    notice = document.createElement('div');
    notice.id = NOTICE_ID;
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    document.body.prepend(notice);
    return notice;
  }

  function hideNotice() {
    const notice = document.getElementById(NOTICE_ID);
    if (notice) notice.style.display = 'none';
    document.body.classList.remove('bk-storage-notice-active');
  }

  function showNotice(status) {
    const notice = getNotice();
    notice.dataset.status = status;
    notice.textContent = status === 'full'
      ? "Account storage is full. Users won't be able to upload files. Please contact admin."
      : 'Account storage is almost full. Please contact admin.';
    notice.style.display = 'flex';
    document.body.classList.add('bk-storage-notice-active');
  }

  async function refresh(companyId = currentCompanyId) {
    if (!companyId || !window.BKAuth?.sb) return;
    currentCompanyId = companyId;
    if (activeRequest) return activeRequest;

    activeRequest = (async () => {
      const { data, error } = await window.BKAuth.sb.rpc('get_company_storage_notice', {
        p_company_id: companyId
      });
      if (error) {
        console.error('Storage notice check failed:', error);
        hideNotice();
        return;
      }
      const result = Array.isArray(data) ? data[0] : data;
      if (result?.status === 'full' || result?.status === 'almost_full') showNotice(result.status);
      else hideNotice();
    })().finally(() => { activeRequest = null; });

    return activeRequest;
  }

  installStyles();
  window.BKStorageNotice = { refresh };
  window.addEventListener('bk:company-ready', event => refresh(event.detail?.companyId));
  if (window.BKActiveCompanyId) refresh(window.BKActiveCompanyId);
}());
