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
})();
