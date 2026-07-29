const DATA_IMAGE_PATTERN = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i;
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const LOGO_CONTENT_ID = 'brightkey-company-logo';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function extensionFor(contentType) {
  if (contentType === 'image/jpeg') return 'jpg';
  return contentType.split('/')[1] || 'png';
}

export function buildEmailBranding(profile = {}) {
  const companyName = String(profile.companyName || 'BrightKey').trim().slice(0, 120);
  const configuredLogo = String(profile.logoDark || profile.logoLight || '').trim();
  let logoSrc = '';
  let nodemailerAttachments = [];
  let resendAttachments = [];

  const dataMatch = configuredLogo.match(DATA_IMAGE_PATTERN);
  if (dataMatch) {
    const contentType = dataMatch[1].toLowerCase();
    const content = dataMatch[2].replace(/\s/g, '');
    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > 0 && buffer.length <= MAX_LOGO_BYTES) {
      const filename = `company-logo.${extensionFor(contentType)}`;
      logoSrc = `cid:${LOGO_CONTENT_ID}`;
      nodemailerAttachments = [{
        filename,
        content: buffer,
        contentType,
        cid: LOGO_CONTENT_ID,
        contentDisposition: 'inline'
      }];
      resendAttachments = [{
        filename,
        content,
        content_type: contentType,
        content_id: LOGO_CONTENT_ID
      }];
    }
  } else if (/^https:\/\/[^\s]+$/i.test(configuredLogo)) {
    logoSrc = configuredLogo;
  }

  const logoHtml = logoSrc
    ? `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(companyName)}" width="180" style="display:block;width:auto;max-width:180px;max-height:36px;height:auto;margin:0 0 32px;border:0;outline:none;text-decoration:none;object-fit:contain;">`
    : `<div style="margin-bottom:32px;color:#4ab3d3;font-family:Arial,sans-serif;font-size:28px;font-weight:800;">${escapeHtml(companyName)}</div>`;

  return { companyName, logoSrc, logoHtml, nodemailerAttachments, resendAttachments };
}
