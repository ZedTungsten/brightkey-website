(() => {
  'use strict';

  function formatTime(value) {
    const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!match) return '';
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const suppliedPeriod = (match[3] || '').toUpperCase();
    if (minutes > 59 || (suppliedPeriod ? hours < 1 || hours > 12 : hours > 23)) return '';
    const period = suppliedPeriod || (hours >= 12 ? 'PM' : 'AM');
    if (!suppliedPeriod) hours = hours % 12 || 12;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  const dayOrder = ['M', 'T', 'W', 'Th', 'F', 'S', 'Su'];

  function syncShiftDays() {
    const picker = document.getElementById('new-emp-shift-days-picker');
    const input = document.getElementById('new-emp-shift-days');
    if (!picker || !input) return;
    input.value = dayOrder
      .filter(day => picker.querySelector(`[data-day="${day}"]`)?.classList.contains('active'))
      .join(',');
  }

  window.BKEmployeeTime = {
    formatRange(value) {
      if (!value || String(value).trim().toLowerCase() === 'free hours') return value || '';
      const parts = String(value).split(/\s+[-–—]\s+/);
      if (parts.length !== 2) return String(value);
      const start = formatTime(parts[0]);
      const end = formatTime(parts[1]);
      return start && end ? `${start} - ${end}` : String(value);
    }
  };

  window.BKDirectoryShift = {
    toggle(button) {
      const active = button.classList.toggle('active');
      button.setAttribute('aria-pressed', String(active));
      syncShiftDays();
    },
    reset() {
      document.querySelectorAll('#new-emp-shift-days-picker .day-selector-btn').forEach(button => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
      });
      syncShiftDays();
    }
  };
})();
