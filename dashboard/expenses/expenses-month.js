(function () {
  'use strict';

  const storageKey = 'bk-expenses-selected-month';

  function read() {
    try {
      const value = window.sessionStorage.getItem(storageKey);
      const match = /^(\d{4})-(\d{2})$/.exec(value || '');
      if (!match) return new Date();
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      if (monthIndex < 0 || monthIndex > 11) return new Date();
      return new Date(year, monthIndex, 1);
    } catch (_) {
      return new Date();
    }
  }

  function write(date) {
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    try {
      window.sessionStorage.setItem(storageKey, value);
    } catch (_) {
      // The page still works when browser storage is unavailable.
    }
  }

  function shift(date, direction) {
    const next = new Date(date.getFullYear(), date.getMonth() + direction, 1);
    write(next);
    return next;
  }

  window.BKExpensesMonth = { read, write, shift };
}());
