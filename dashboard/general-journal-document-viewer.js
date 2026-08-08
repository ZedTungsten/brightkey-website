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
