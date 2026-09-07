(function () {
  'use strict';

  function bind() {
    const menu = document.querySelector('.image-source-menu');
    const trigger = document.getElementById('image-source-trigger');
    const options = document.getElementById('image-source-options');
    const close = () => {
      options.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };

    trigger.addEventListener('click', () => {
      const opening = options.hidden;
      options.hidden = !opening;
      trigger.setAttribute('aria-expanded', String(opening));
      if (opening) options.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
    });
    document.getElementById('upload-computer-image').addEventListener('click', () => {
      close();
      document.getElementById('source-images').click();
    });
    options.addEventListener('click', event => {
      if (event.target.closest('[role="menuitem"]')) close();
    });
    document.addEventListener('click', event => {
      if (!menu.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !options.hidden) {
        close();
        trigger.focus();
      }
    });
  }

  window.BKImageEditorSourceMenu = { bind };
})();
