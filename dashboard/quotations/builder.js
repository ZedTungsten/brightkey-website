'use strict';

(function quotationBuilder() {
  const CONFIG_KEY = 'quotation_builder_config';
  const FONT_FAMILIES = { times:'"Times New Roman",Times,serif', montserrat:'"Montserrat",sans-serif', commissioner:'"Commissioner",sans-serif' };
  const { FIELD_IDS, DEFAULTS } = window.BKQuotationDocument;
  const state = { companyId:null, companyProfile:{}, documentDate:new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()) };
  const byId = id => document.getElementById(id);

  function toast(message, type = 'success') {
    const container = byId('toast-container');
    if (!container) return;
    const item = document.createElement('div');
    item.className = `toast toast-${type}`;
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => item.remove(), 3500);
  }

  function fieldValue(id) { return String(byId(id)?.value || '').trim(); }
  function showValue(targetId, value) { const target = byId(targetId); if (target) target.textContent = value || '—'; }

  function isAllowedLogoSource(value) {
    if (!value) return false;
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return true;
    try { return ['http:', 'https:'].includes(new URL(value, window.location.origin).protocol); }
    catch (_) { return false; }
  }

  function renderLogo() {
    const logo = byId('quotation-logo');
    const fallback = byId('quotation-logo-fallback');
    const status = byId('quotation-logo-status');
    const source = String(state.companyProfile.logoDark || '').trim();
    fallback.textContent = state.companyProfile.companyName || 'Company';
    if (!isAllowedLogoSource(source)) {
      logo.hidden = true; fallback.hidden = false;
      status.textContent = source ? 'The configured dark logo format is unsupported.' : 'No dark logo is configured in Company Settings.';
      return;
    }
    logo.onload = () => { logo.hidden = false; fallback.hidden = true; status.textContent = 'Using the dark logo from Company Settings.'; };
    logo.onerror = () => { logo.hidden = true; fallback.hidden = false; status.textContent = 'The configured dark logo could not be loaded.'; };
    logo.src = source;
    if (logo.complete && logo.naturalWidth > 0) logo.onload();
  }

  function renderPreview() {
    const familyKey = byId('quotation-font-family')?.value || DEFAULTS['quotation-font-family'];
    const logoSize = byId('quotation-logo-size')?.value || DEFAULTS['quotation-logo-size'];
    const alignment = byId('quotation-brand-alignment')?.value || DEFAULTS['quotation-brand-alignment'];
    const previewTitle = byId('preview-title');
    byId('quotation-logo').dataset.size = logoSize;
    byId('quotation-branding').dataset.alignment = alignment;
    previewTitle.style.fontFamily = FONT_FAMILIES[familyKey] || FONT_FAMILIES.commissioner;
    previewTitle.style.fontWeight = byId('quotation-font-weight')?.value || DEFAULTS['quotation-font-weight'];
    previewTitle.style.fontSize = `${byId('quotation-title-font-size')?.value || DEFAULTS['quotation-title-font-size']}px`;
    showValue('preview-title', fieldValue('quotation-title') || DEFAULTS['quotation-title']);
    byId('preview-subheader').textContent = fieldValue('quotation-subheader');
    showValue('preview-number', fieldValue('quotation-number'));
    showValue('preview-company', fieldValue('prepared-company'));
    showValue('preview-address', fieldValue('prepared-address'));
    showValue('preview-contact', fieldValue('prepared-contact'));
    showValue('preview-client-name', fieldValue('project-client-name'));
    showValue('preview-client-address', fieldValue('project-client-address'));
    showValue('preview-project-scope', fieldValue('project-scope'));
  }

  function collectSettings() {
    return FIELD_IDS.reduce((settings, id) => { settings[id] = byId(id)?.value || ''; return settings; }, {});
  }

  function restoreSettings(settings = {}) {
    FIELD_IDS.forEach(id => { const field = byId(id); if (field) field.value = settings[id] ?? DEFAULTS[id]; });
  }

  async function saveSettings() {
    const button = byId('quotation-save-settings');
    const originalText = button.textContent;
    button.disabled = true; button.textContent = 'Saving...';
    try {
      const { error } = await window.BKAuth.sb.from('global_settings').upsert({ company_id:state.companyId, key:CONFIG_KEY, value:collectSettings() });
      if (error) throw error;
      toast('Quotation settings saved.');
    } catch (error) {
      console.error('Unable to save quotation settings:', error);
      toast('Quotation settings could not be saved.', 'error');
    } finally { button.disabled = false; button.textContent = originalText; }
  }

  async function savePdf() {
    if (typeof window.html2pdf !== 'function') { toast('The PDF generator is still loading. Please try again.', 'error'); return; }
    const sheet = byId('quotation-sheet');
    const button = byId('quotation-save-pdf');
    const quotationNumber = fieldValue('quotation-number').replace(/[^a-z0-9_-]+/gi, '_') || 'Draft';
    const originalHtml = button.innerHTML;
    const originalShadow = sheet.style.boxShadow;
    const originalRadius = sheet.style.borderRadius;
    button.disabled = true; button.textContent = 'Saving...'; sheet.style.boxShadow = 'none'; sheet.style.borderRadius = '0';
    try {
      await window.html2pdf().set({ margin:[10,10,10,10], filename:`Quotation_${quotationNumber}.pdf`, image:{type:'jpeg',quality:.98}, html2canvas:{scale:2,useCORS:true,letterRendering:true,scrollX:0,scrollY:0}, jsPDF:{unit:'mm',format:'a4',orientation:'portrait'} }).from(sheet).save();
      toast('Quotation PDF saved.');
    } catch (error) {
      console.error('Unable to generate quotation PDF:', error);
      toast('The quotation PDF could not be generated.', 'error');
    } finally {
      sheet.style.boxShadow = originalShadow; sheet.style.borderRadius = originalRadius; button.disabled = false; button.innerHTML = originalHtml;
    }
  }

  function bindEvents() {
    FIELD_IDS.forEach(id => { byId(id)?.addEventListener('input', renderPreview); byId(id)?.addEventListener('change', renderPreview); });
    byId('quotation-save-settings')?.addEventListener('click', saveSettings);
    byId('quotation-save-pdf')?.addEventListener('click', savePdf);
  }

  function renderDate() {
    byId('preview-date').textContent = new Intl.DateTimeFormat('en-PH', { year:'numeric', month:'long', day:'numeric', timeZone:'Asia/Manila' }).format(new Date(`${state.documentDate}T12:00:00Z`));
  }

  function restoreDocument(snapshot) {
    const document = window.BKQuotationDocument.validate(snapshot);
    restoreSettings(document.pages[0].fields);
    state.companyProfile = document.branding;
    state.documentDate = document.date;
    renderLogo(); renderPreview(); renderDate();
  }

  async function init() {
    try {
      const authInfo = await window.BKAuth.checkRoleGate(['Sales'], '/admin.html');
      if (!authInfo) return;
      const sb = window.BKAuth.sb;
      const { data:company, error:companyError } = await sb.from('companies').select('id').eq('tenant_id', authInfo.tenantId).limit(1).maybeSingle();
      if (companyError) throw companyError;
      if (!company?.id) throw new Error('No company is configured for this tenant.');
      state.companyId = company.id;
      const { data:settings, error:settingsError } = await sb.from('global_settings').select('key,value').eq('company_id', state.companyId).in('key', [CONFIG_KEY,'company_profile_config']).limit(2);
      if (settingsError) throw settingsError;
      const settingsMap = Object.fromEntries((settings || []).map(item => [item.key, item.value || {}]));
      state.companyProfile = settingsMap.company_profile_config || {};
      restoreSettings(settingsMap[CONFIG_KEY]); renderLogo(); renderPreview(); renderDate(); bindEvents();
      window.BKQuotationFiles.init({
        sb, companyId:state.companyId, toast,
        capture:() => window.BKQuotationDocument.capture(collectSettings(), state.companyProfile, state.documentDate),
        restore:restoreDocument
      });
      byId('quotation-loading').hidden = true; byId('quotation-sheet').hidden = false;
    } catch (error) {
      console.error('Unable to initialize quotation builder:', error);
      byId('quotation-loading').textContent = 'The quotation builder could not be loaded.';
      toast('The quotation builder could not be loaded.', 'error');
    }
  }

  init();
})();
