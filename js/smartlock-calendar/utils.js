'use strict';

// --- Helper Formatters ---
function formatDateISO(dateObj) {
  const y = dateObj.getFullYear();
  const m = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const d = dateObj.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isAfternoon(timeStr) {
  if (!timeStr) return false;
  const lower = timeStr.toLowerCase();
  return lower.includes('pm') || lower.includes('afternoon');
}

function formatDateFriendly(dateStr) {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatInstallerName(nameStr) {
  if (!nameStr) return 'None Assigned';
  if (typeof nameStr !== 'string') {
    nameStr = nameStr.name || '';
  }
  if (!nameStr) return 'None Assigned';
  const delimiter = nameStr.includes('|') ? '|' : (nameStr.includes(',') ? ',' : null);
  if (delimiter) {
    return nameStr.split(delimiter)
      .map(n => formatInstallerName(n.trim()))
      .filter(Boolean)
      .join(', ');
  }
  let cleaned = nameStr.replace(/\s*\([^)]*\)/g, '').trim();
  if (!cleaned) return '';
  const parts = cleaned.split(/\s+/);
  if (parts.length <= 1) return cleaned;
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const initial = lastName ? ` ${lastName.charAt(0).toUpperCase()}.` : '';
  return `${firstName}${initial}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
