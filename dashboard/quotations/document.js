'use strict';

(function quotationDocument() {
  const FIELD_IDS = ['quotation-branding-option','quotation-logo-size','quotation-brand-alignment','quotation-header-image','quotation-title','quotation-font-family','quotation-font-weight','quotation-title-font-size','prepared-company','prepared-address','prepared-contact','quotation-include-project','project-client-name','project-client-address','project-scope','quotation-items-title'];
  const DEFAULTS = { 'quotation-branding-option':'logo', 'quotation-logo-size':'small', 'quotation-brand-alignment':'left', 'quotation-header-image':'', 'quotation-title':'Supply and Installation Quotation', 'quotation-font-family':'commissioner', 'quotation-font-weight':'700', 'quotation-title-font-size':'32', 'prepared-company':'', 'prepared-address':'', 'prepared-contact':'', 'quotation-include-project':'true', 'project-client-name':'', 'project-client-address':'', 'project-scope':'', 'quotation-items-title':'Supply and Installation' };
  const OPTIONS = { 'quotation-branding-option':['logo','header-image'], 'quotation-logo-size':['smallest','small','medium'], 'quotation-brand-alignment':['left','center'], 'quotation-font-family':['commissioner','merriweather','montserrat','open-sans','roboto','times'], 'quotation-font-weight':['400','500','600','700'], 'quotation-title-font-size':['24','32','40'], 'quotation-include-project':['true','false'] };
  const CONTENT_KINDS = ['scope-of-work','exclusions','project-schedule','warranty','payment-terms','quotation-validity','acceptance'];

  function validate(document) {
    if (document?.version !== 1 || !Array.isArray(document.pages) || !document.pages.length || document.pages.length > 50 || document.pages.some(page => !['cover','content'].includes(page?.type))) throw new Error('Unsupported quotation document.');
    const optionalFields = new Set(['quotation-branding-option','quotation-header-image','quotation-title-font-size','quotation-include-project','quotation-items-title']);
    const requiredFields = FIELD_IDS.filter(id => !optionalFields.has(id));
    const pages = document.pages.map(page => {
      if (page.type === 'content') {
        const sections = Array.isArray(page.sections) ? page.sections : (page.section ? [page.section] : []);
        if (sections.length > 30 || sections.some(section => !CONTENT_KINDS.includes(section?.kind) || typeof section?.html !== 'string' || section.html.length > 100000)) throw new Error('Invalid quotation content page.');
        return { type:'content', sections:sections.map(section => {
          const normalized = { kind:section.kind, html:section.html };
          if (section.kind !== 'acceptance') return normalized;
          const acceptance = section.acceptance || {};
          const text = key => String(acceptance[key] || '').slice(0, 160);
          const signature = key => {
            const value = String(acceptance[key] || '');
            return /^data:image\/png;base64,[a-z0-9+/=\s]+$/i.test(value) && value.length <= 2.8 * 1024 * 1024 ? value : '';
          };
          normalized.acceptance = { preparedName:text('preparedName'), preparedPosition:text('preparedPosition'), preparedSignature:signature('preparedSignature'), acceptedName:text('acceptedName'), acceptedPosition:text('acceptedPosition'), acceptedSignature:signature('acceptedSignature') };
          return normalized;
        }) };
      }
      const fields = page.fields;
      const items = page.items ?? [{ description:'', model:'', qty:'1' }];
      const pricing = page.pricing ?? { subtotal:'', less:[{ label:'Less:', amount:'' }] };
      if (!fields || requiredFields.some(id => typeof fields[id] !== 'string')) throw new Error('Incomplete quotation fields.');
      const normalizedFields = { ...fields };
      optionalFields.forEach(id => { normalizedFields[id] = fields[id] ?? DEFAULTS[id]; });
      if ([...optionalFields].some(id => typeof normalizedFields[id] !== 'string')) throw new Error('Incomplete quotation fields.');
      if (normalizedFields['quotation-items-title'].length > 120) throw new Error('Invalid quotation items header.');
      if (normalizedFields['quotation-header-image'] && (!/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(normalizedFields['quotation-header-image']) || normalizedFields['quotation-header-image'].length > 2.8 * 1024 * 1024)) throw new Error('Unsupported quotation header image.');
      if (Object.entries(OPTIONS).some(([id, options]) => !options.includes(normalizedFields[id]))) throw new Error('Unsupported quotation settings.');
      if (!Array.isArray(items) || !items.length || items.length > 200 || items.some(item => typeof item?.description !== 'string' || typeof item?.model !== 'string' || typeof item?.qty !== 'string' || item.description.length > 300 || item.model.length > 120 || item.qty.length > 40)) throw new Error('Invalid quotation items.');
      if (typeof pricing?.subtotal !== 'string' || pricing.subtotal.length > 40 || !Array.isArray(pricing.less) || pricing.less.length > 50 || pricing.less.some(item => (item?.label !== undefined && (typeof item.label !== 'string' || item.label.length > 80)) || typeof item?.amount !== 'string' || item.amount.length > 40)) throw new Error('Invalid quotation pricing.');
      return { type:'cover', fields:Object.fromEntries(FIELD_IDS.map(id => [id, normalizedFields[id]])), items:items.map(item => ({ description:item.description, model:item.model, qty:item.qty })), pricing:{ subtotal:pricing.subtotal, less:pricing.less.map(item => ({ label:item.label ?? 'Less:', amount:item.amount })) } };
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(document.date) || !Number.isFinite(Date.parse(`${document.date}T12:00:00Z`))) throw new Error('Invalid quotation date.');
    if (typeof document.branding?.companyName !== 'string' || typeof document.branding?.logoDark !== 'string') throw new Error('Incomplete quotation branding.');
    return {
      version:1,
      date:document.date,
      branding:{ companyName:document.branding.companyName, logoDark:document.branding.logoDark },
      pages
    };
  }

  function capture(fields, branding, date, items, pricing, pages) {
    const documentPages = pages || [{ type:'cover', fields, items, pricing }];
    return validate({ version:1, date, branding:{ companyName:String(branding.companyName || ''), logoDark:String(branding.logoDark || '') }, pages:documentPages });
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

  window.BKQuotationDocument = { FIELD_IDS, DEFAULTS, CONTENT_KINDS, capture, validate, nextQuotationNumber };
})();
