'use strict';

(function quotationDocument() {
  const FIELD_IDS = ['quotation-logo-size','quotation-brand-alignment','quotation-subheader','quotation-title','quotation-font-family','quotation-font-weight','quotation-title-font-size','prepared-company','prepared-address','prepared-contact','project-client-name','project-client-address','project-scope'];
  const DEFAULTS = { 'quotation-logo-size':'small', 'quotation-brand-alignment':'left', 'quotation-subheader':'', 'quotation-title':'Supply and Installation Quotation', 'quotation-font-family':'commissioner', 'quotation-font-weight':'700', 'quotation-title-font-size':'32', 'prepared-company':'', 'prepared-address':'', 'prepared-contact':'', 'project-client-name':'', 'project-client-address':'', 'project-scope':'' };
  const OPTIONS = { 'quotation-logo-size':['small','medium'], 'quotation-brand-alignment':['left','center'], 'quotation-font-family':['times','montserrat','commissioner'], 'quotation-font-weight':['400','500','600','700'], 'quotation-title-font-size':['24','32','40'] };

  function validate(document) {
    // The current builder has one cover page. Reject unsupported versions/pages
    // instead of silently discarding content from a newer builder.
    if (document?.version !== 1 || !Array.isArray(document.pages) || document.pages.length !== 1 || document.pages[0]?.type !== 'cover') throw new Error('Unsupported quotation document.');
    const fields = document.pages[0].fields;
    const requiredFields = FIELD_IDS.filter(id => id !== 'quotation-title-font-size');
    if (!fields || requiredFields.some(id => typeof fields[id] !== 'string')) throw new Error('Incomplete quotation fields.');
    const normalizedFields = { ...fields, 'quotation-title-font-size':fields['quotation-title-font-size'] ?? DEFAULTS['quotation-title-font-size'] };
    if (Object.entries(OPTIONS).some(([id, options]) => !options.includes(normalizedFields[id]))) throw new Error('Unsupported quotation settings.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(document.date) || !Number.isFinite(Date.parse(`${document.date}T12:00:00Z`))) throw new Error('Invalid quotation date.');
    if (typeof document.branding?.companyName !== 'string' || typeof document.branding?.logoDark !== 'string') throw new Error('Incomplete quotation branding.');
    return {
      version:1,
      date:document.date,
      branding:{ companyName:document.branding.companyName, logoDark:document.branding.logoDark },
      pages:[{ type:'cover', fields:Object.fromEntries(FIELD_IDS.map(id => [id, normalizedFields[id]])) }]
    };
  }

  function capture(fields, branding, date) {
    return validate({ version:1, date, branding:{ companyName:String(branding.companyName || ''), logoDark:String(branding.logoDark || '') }, pages:[{ type:'cover', fields }] });
  }

  function nextQuotationNumber(date, latestNumber = '') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date));
    if (!match) throw new Error('Invalid quotation date.');
    const prefix = `${match[2]}${match[3]}${match[1].slice(-2)}`;
    const latestMatch = new RegExp(`^${prefix}-(\\d{4})$`).exec(String(latestNumber));
    const sequence = latestMatch ? Number(latestMatch[1]) + 1 : 0;
    if (sequence > 9999) throw new Error('Daily quotation number limit reached.');
    return `${prefix}-${String(sequence).padStart(4, '0')}`;
  }

  window.BKQuotationDocument = { FIELD_IDS, DEFAULTS, capture, validate, nextQuotationNumber };
})();
