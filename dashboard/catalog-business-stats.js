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

(function initCatalogImageTheater() {
  let returnFocus = null;
  let bodyOverflow = '';

  function closeTheater() {
    const theater = document.getElementById('catalog-image-theater');
    if (!theater?.classList.contains('open')) return;
    theater.classList.remove('open');
    document.body.style.overflow = bodyOverflow;
    setTimeout(() => {
      if (!theater.classList.contains('open')) theater.style.display = 'none';
    }, 200);
    returnFocus?.focus();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const theater = document.getElementById('catalog-image-theater');
    const theaterImage = document.getElementById('catalog-theater-image');
    const closeButton = document.getElementById('catalog-theater-close');
    const productsBody = document.getElementById('products-body');
    if (!theater || !theaterImage || !closeButton || !productsBody) return;

    productsBody.addEventListener('click', (event) => {
      const trigger = event.target.closest('.product-image-trigger');
      const sourceImage = trigger?.querySelector('img');
      if (!sourceImage?.currentSrc) return;
      returnFocus = trigger;
      theaterImage.src = sourceImage.currentSrc;
      theaterImage.alt = sourceImage.alt;
      bodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      theater.style.display = 'flex';
      theater.offsetHeight;
      theater.classList.add('open');
      closeButton.focus();
    });

    theater.addEventListener('click', (event) => {
      if (event.target === theater) closeTheater();
    });
    closeButton.addEventListener('click', closeTheater);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeTheater();
    });
  });
})();
