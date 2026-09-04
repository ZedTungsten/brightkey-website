'use strict';

(function registerCatalogVariants(root) {
  function parentFor({ products, editingId, business, parentSku }) {
    if (!parentSku || !business) return null;
    return products.find(product =>
      product.id !== editingId &&
      product.business === business &&
      product.sku &&
      product.sku.toLowerCase() === parentSku.toLowerCase()
    ) || null;
  }

  function resetInput(input) {
    input.disabled = false;
    input.readOnly = false;
    input.placeholder = 'e.g. Side, Color';
    input.classList.remove('inherited-value');
  }

  root.BKCatalogVariants = Object.freeze({
    parentFor,
    resetInput,
    productSlug(title, sku) {
      const value = `${String(title || '').replace(/[()]/g, ' ')} ${sku || ''}`.trim();
      return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    },
    closeDrawer(isAutosaving) {
      if (isAutosaving) return;
      const table = document.querySelector('.table-responsive');
      const savedScroll = table ? table.scrollTop : 0;
      document.getElementById('product-drawer').classList.remove('open');
      document.getElementById('drawer-overlay').classList.remove('open');
      if (table) requestAnimationFrame(() => { table.scrollTop = savedScroll; });
    },
    updateStatusSelectStyle(element) {
      if (!element) return;
      element.classList.toggle('status-select-draft', element.value === 'draft');
      element.classList.toggle('status-select-published', element.value !== 'draft');
    },
    configureBatchInput(input, products) {
      if (!products.some(product => product.parent_sku)) return;
      input.disabled = true;
      input.placeholder = 'Set in parent SKU';
      input.classList.add('inherited-value');
    },
    syncInput(input, context) {
      if (!context.parentSku) return resetInput(input);
      input.value = parentFor(context)?.variant_name || '';
      input.readOnly = true;
      input.placeholder = 'Set in parent SKU';
      input.classList.add('inherited-value');
    },
    validateParentInput(input, context) {
      const exists = !context.parentSku || !!parentFor(context);
      input.style.borderColor = exists ? '' : 'var(--danger)';
      input.style.boxShadow = exists ? '' : '0 0 0 3px rgba(220, 38, 38, 0.15)';
    },
    async syncChildren({ client, companyId, business, parentSku, variantName }) {
      return client.from('products').update({ variant_name: variantName }).eq('company_id', companyId).eq('business', business).ilike('parent_sku', parentSku);
    },
    async refreshAfterSave(products, editingId, payload, refreshers) {
      const savedProduct = products.find(product => product.id === editingId);
      if (savedProduct) Object.assign(savedProduct, payload);
      try {
        for (const refresh of refreshers) await refresh();
      } catch (error) {
        console.warn('Product saved, but the catalog list could not be refreshed:', error);
      }
    }
  });
})(globalThis);
