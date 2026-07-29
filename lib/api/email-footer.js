const SOCIAL_PATHS = {
  Facebook: ['0 0 24 24', 'M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z'],
  Messenger: ['0 0 24 24', 'M12 2C6.48 2 2 6.14 2 11.25c0 2.91 1.45 5.51 3.73 7.15V22l3.41-1.87c.88.24 1.8.37 2.86.37 5.52 0 10-4.14 10-9.25S17.52 2 12 2zm1.14 12.03-2.58-2.75-5.04 2.75 5.54-5.89 2.63 2.75 4.99-2.75-5.54 5.89z'],
  Instagram: ['0 0 24 24', 'M12 2.16c3.2 0 3.58.02 4.85.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.15 3.23-1.67 4.77-4.92 4.92-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-3.26-.15-4.77-1.7-4.92-4.92-.06-1.27-.07-1.64-.07-4.85s.01-3.58.07-4.85c.15-3.23 1.67-4.77 4.92-4.92 1.27-.05 1.65-.07 4.85-.07zM12 0C8.74 0 8.33.01 7.05.07 2.7.27.27 2.69.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.2 4.36 2.62 6.78 6.98 6.98C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c4.35-.2 6.78-2.62 6.98-6.98.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.2-4.35-2.62-6.78-6.98-6.98C15.67.01 15.26 0 12 0zm0 5.84A6.16 6.16 0 1 0 12 18.16 6.16 6.16 0 0 0 12 5.84zm0 10.16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.41-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z'],
  X: ['0 0 24 24', 'M18.24 2.25h3.31l-7.23 8.26 8.51 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.84L7.08 4.13H5.12z'],
  LinkedIn: ['0 0 24 24', 'M19 0H5a5 5 0 0 0-5 5v14a5 5 0 0 0 5 5h14a5 5 0 0 0 5-5V5a5 5 0 0 0-5-5zM8 19H5V8h3zm-1.5-12.27A1.76 1.76 0 1 1 6.5 3.2a1.76 1.76 0 0 1 0 3.53zM20 19h-3v-5.6c0-3.37-4-3.11-4 0V19h-3V8h3v1.77c1.4-2.59 7-2.78 7 2.47z'],
  Tiktok: ['0 0 16 16', 'M9 0h1.98c.14.72.54 1.62 1.24 2.51C12.9 3.39 13.8 4 15 4v2c-1.75 0-3.07-.81-4-1.83V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z'],
  YouTube: ['0 0 24 24', 'M23.5 6.16a3 3 0 0 0-2.11-2.11C19.52 3.55 12 3.55 12 3.55s-7.52 0-9.39.5A3 3 0 0 0 .5 6.16C0 8.03 0 12 0 12s0 3.97.5 5.84a3 3 0 0 0 2.11 2.11c1.87.51 9.39.51 9.39.51s7.52 0 9.39-.51a3 3 0 0 0 2.11-2.11C24 15.97 24 12 24 12s0-3.97-.5-5.84zM9.55 15.57V8.43L15.82 12z'],
  Pinterest: ['0 0 24 24', 'M12 0a12 12 0 0 0-4.37 23.17c-.11-.95-.2-2.4.04-3.44l1.41-5.96s-.36-.72-.36-1.78c0-1.67.97-2.92 2.17-2.92 1.02 0 1.52.77 1.52 1.69 0 1.03-.66 2.57-1 4-.28 1.19.6 2.17 1.78 2.17 2.13 0 3.77-2.25 3.77-5.5 0-2.87-2.06-4.88-5.01-4.88-3.41 0-5.42 2.56-5.42 5.21 0 1.03.4 2.14.9 2.74.1.12.11.22.08.34l-.33 1.36c-.05.22-.17.27-.4.16-1.5-.7-2.44-2.89-2.44-4.65 0-3.78 2.75-7.26 7.93-7.26 4.16 0 7.4 2.97 7.4 6.93 0 4.14-2.61 7.46-6.23 7.46-1.22 0-2.36-.63-2.75-1.38l-.75 2.86a13 13 0 0 1-1.49 3.14A12 12 0 1 0 12 0z']
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeUrl(value) {
  const url = String(value || '').trim();
  if (/^https?:\/\/[^\s]+$/i.test(url)) return url;
  if (/^(?:www\.)?(?:m\.me|messenger\.com|facebook\.com|instagram\.com|x\.com|twitter\.com|linkedin\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.[a-z.]+)\/[^\s]+$/i.test(url)) {
    return `https://${url}`;
  }
  return '';
}

function socialPlatform(value) {
  const platform = String(value || '').trim();
  return Object.keys(SOCIAL_PATHS).find(key => key.toLowerCase() === platform.toLowerCase()) || '';
}

export function buildEmailFooter(profile = {}, options = {}) {
  const color = String(options.socialColor || '#52525b').slice(0, 20);
  const links = Array.isArray(profile.socialLinks) ? profile.socialLinks.slice(0, 12) : [];
  const socialHtml = links.map(item => {
    const platform = socialPlatform(item?.platform);
    const icon = SOCIAL_PATHS[platform];
    const url = safeUrl(item?.url);
    if (!icon || !url) return '';
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(platform)}" style="display:inline-block;margin:0 6px;text-decoration:none;"><svg viewBox="${icon[0]}" width="18" height="18" fill="${escapeHtml(color)}" style="display:block;"><path d="${icon[1]}"/></svg></a>`;
  }).join('');

  const companyName = String(profile.companyName || 'BrightKey Solutions').trim().slice(0, 120);
  const address1 = String(profile.companyAddressLine1 || '').trim().slice(0, 200);
  const address2 = String(profile.companyAddressLine2 || '').trim().slice(0, 200);
  const phone = String(profile.phone || '').trim().slice(0, 80);
  const email = String(profile.email || '').trim().slice(0, 160);
  return `
    <div style="margin-top:36px;padding-top:18px;border-top:1px solid #e5e7eb;text-align:center;font-family:Arial,sans-serif;color:#9ca3af;font-size:11px;line-height:1.4;">
      ${socialHtml ? `<div style="margin-bottom:12px;">${socialHtml}</div>` : ''}
      <div style="font-weight:700;font-size:13px;color:#6b7280;margin-bottom:2px;">${escapeHtml(companyName)}</div>
      ${address1 ? `<div>${escapeHtml(address1)}</div>` : ''}
      ${address2 ? `<div>${escapeHtml(address2)}</div>` : ''}
      ${(phone || email) ? `<div style="margin-top:2px;">${escapeHtml(phone)}${phone && email ? ' | ' : ''}${escapeHtml(email)}</div>` : ''}
    </div>`;
}
