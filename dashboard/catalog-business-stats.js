'use strict';

window.BKCatalogBusinessStats = {
  render(businesses, products) {
    const statsStrip = document.querySelector('.stats-strip');
    if (!statsStrip) return;

    statsStrip.querySelectorAll('[data-business-stat]').forEach((cell) => cell.remove());
    const countsByBusiness = new Map();
    products.forEach((product) => {
      if (!product.business) return;
      countsByBusiness.set(product.business, (countsByBusiness.get(product.business) || 0) + 1);
    });

    businesses.forEach((business) => {
      const key = business.name.toLowerCase().replace(/[\s_.-]+/g, '_');
      const cell = document.createElement('div');
      const content = document.createElement('div');
      const count = document.createElement('div');
      const label = document.createElement('div');

      cell.className = 'stat-cell';
      cell.dataset.businessStat = key;
      count.className = 'stat-num';
      count.textContent = String(countsByBusiness.get(key) || 0);
      label.className = 'stat-label';
      label.textContent = business.name;
      content.append(count, label);
      cell.appendChild(content);
      statsStrip.appendChild(cell);
    });
  }
};
