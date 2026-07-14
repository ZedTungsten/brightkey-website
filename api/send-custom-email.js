import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'onboarding@resend.dev';

// Helper to escape HTML characters in templates
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Compile the builder blocks JSON and settings into beautiful HTML email body
function compileHtmlBody(blocks, settings, logo, address, eventId, recipientEmail, origin) {
  const bgColor = settings.bgColor || '#ffffff';
  const align = settings.alignment || 'left';
  const headSize = settings.headerSize || '28px';
  const subSize = settings.subSize || '18px';
  const bodySize = settings.bodySize || '14px';
  const bodyColor = settings.bodyColor || '#374151';
  const indent = settings.indent || '24px';
  const lineH = settings.lineHeight || '1.5';
  const gap = settings.gap || '20px';
  const linkColor = settings.linkColor || '#06b6d4';
  const ctaAffirm = settings.ctaAffirm || '#16a34a';
  const ctaNegative = settings.ctaNegative || '#dc2626';

  const socialLinks = settings.socialLinks || [];
  const socialColor = settings.socialColor || '#52525b';

  const backendSocialIcons = {
    Facebook: `<svg viewBox="0 0 24 24" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c4.56-.93 8-4.96 8-9.75z"/></svg>`,
    Messenger: `<svg viewBox="0 0 24 24" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M12 2C6.48 2 2 6.14 2 11.25c0 2.91 1.45 5.51 3.73 7.15V22l3.41-1.87c.88.24 1.8.37 2.86.37 5.52 0 10-4.14 10-9.25S17.52 2 12 2zm1.14 12.03l-2.58-2.75-5.04 2.75 5.54-5.89 2.63 2.75 4.99-2.75-5.54 5.89z"/></svg>`,
    Instagram: `<svg viewBox="0 0 24 24" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
    X: `<svg viewBox="0 0 24 24" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
    LinkedIn: `<svg viewBox="0 0 24 24" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`,
    Tiktok: `<svg viewBox="0 0 16 16" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M9 0h1.98c.144.715.54 1.617 1.235 2.512C12.895 3.389 13.797 4 15 4v2c-1.753 0-3.07-.814-4-1.829V11a5 5 0 1 1-5-5v2a3 3 0 1 0 3 3z"/></svg>`,
    YouTube: `<svg viewBox="0 0 24 24" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.518 3.545 12 3.545 12 3.545s-7.518 0-9.388.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.87.508 9.388.508 9.388.508s7.518 0 9.388-.508a3.003 3.003 0 0 0 2.11-2.11C24 15.967 24 12 24 12s0-3.967-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
    Pinterest: `<svg viewBox="0 0 24 24" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/></svg>`,
    Amazon: `<svg viewBox="0 0 16 16" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M10.813 11.968c.157.083.36.074.5-.05l.005.005a90 90 0 0 1 1.623-1.405c.173-.143.143-.372.006-.563l-.125-.17c-.345-.465-.673-.906-.673-1.791v-3.3l.001-.335c.008-1.265.014-2.421-.933-3.305C10.404.274 9.06 0 8.03 0 6.017 0 3.77.75 3.296 3.24c-.047.264.143.404.316.443l2.054.22c.19-.009.33-.196.366-.387.176-.857.896-1.271 1.703-1.271.435 0 .929.16 1.188.55.264.39.26.91.257 1.376v.432q-.3.033-.621.065c-1.113.114-2.397.246-3.36.67C3.873 5.91 2.94 7.08 2.94 8.798c0 2.2 1.387 3.298 3.168 3.298 1.506 0 2.328-.354 3.489-1.54l.167.246c.274.405.456.675 1.047 1.166ZM6.03 8.431C6.03 6.627 7.647 6.3 9.177 6.3v.57c.001.776.002 1.434-.396 2.133-.336.595-.87.961-1.465.961-.812 0-1.286-.619-1.286-1.533M.435 12.174c2.629 1.603 6.698 4.084 13.183.997.28-.116.475.078.199.431C13.538 13.96 11.312 16 7.57 16 3.832 16 .968 13.446.094 12.386c-.24-.275.036-.4.199-.299z"/><path d="M13.828 11.943c.567-.07 1.468-.027 1.645.204.135.176-.004.966-.233 1.533-.23.563-.572.961-.762 1.115s-.333.094-.23-.137c.105-.23.684-1.663.455-1.963-.213-.278-1.177-.177-1.625-.13l-.09.009q-.142.013-.233.024c-.193.021-.245.027-.274-.032-.074-.209.779-.556 1.347-.623"/></svg>`,
    Medium: `<svg viewBox="0 0 16 16" width="18" height="18" fill="${socialColor}" style="display:inline-block; vertical-align:middle;"><path d="M9.025 8c0 2.485-2.02 4.5-4.513 4.5A4.506 4.506 0 0 1 0 8c0-2.486 2.02-4.5 4.512-4.5A4.506 4.506 0 0 1 9.025 8m4.95 0c0 2.34-1.01 4.236-2.256 4.236S9.463 10.339 9.463 8c0-2.34 1.01-4.236 2.256-4.236S13.975 5.661 13.975 8M16 8c0 2.096-.355 3.795-.794 3.795-.438 0-.793-1.7-.793-3.795 0-2.096.355-3.795.794-3.795.438 0 .793 1.699.793 3.795"/></svg>`
  };

  let socialHtml = '';
  if (socialLinks.length > 0) {
    socialHtml = `
      <div style="text-align: ${align}; margin-top: 24px; margin-bottom: 12px;">
        ${socialLinks.map(item => `
          <a href="${item.url}" target="_blank" style="text-decoration:none; margin-right:12px; display:inline-block;">
            ${backendSocialIcons[item.platform] || ''}
          </a>
        `).join('')}
      </div>
    `;
  }

  let blocksHtml = '';

  blocks.forEach(b => {
    let blockStyle = `margin-bottom: ${gap}; text-align: ${align}; line-height: ${lineH}; color: ${bodyColor}; font-size: ${bodySize}; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;`;
    
    if (b.type === 'header') {
      blocksHtml += `<h1 style="${blockStyle} font-size: ${headSize}; font-weight: 800; color: #111827; margin-top: 0;">${esc(b.value)}</h1>`;
    } else if (b.type === 'subheader') {
      blocksHtml += `<h2 style="${blockStyle} font-size: ${subSize}; font-weight: 600; color: #4b5563; margin-top: 0;">${esc(b.value)}</h2>`;
    } else if (b.type === 'section-header') {
      blocksHtml += `<h3 style="${blockStyle} font-size: 17px; font-weight: 700; color: #111827; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin-top: 24px;">${esc(b.value)}</h3>`;
    } else if (b.type === 'section-body') {
      const indentedStyle = `${blockStyle} padding-left: ${indent};`;
      blocksHtml += `<p style="${indentedStyle}">${esc(b.value).replace(/\n/g, '<br/>')}</p>`;
    } else if (b.type === 'body') {
      blocksHtml += `<p style="${blockStyle}">${esc(b.value).replace(/\n/g, '<br/>')}</p>`;
    } else if (b.type === 'signature') {
      blocksHtml += `<p style="${blockStyle} margin-top: 28px; font-style: italic;">${esc(b.value).replace(/\n/g, '<br/>')}</p>`;
    } else if (b.type === 'bullet-list') {
      const items = (b.value || '').split('\n').filter(i => i.trim() !== '');
      if (items.length > 0) {
        const liStyle = `margin-bottom: 6px; text-align: ${align};`;
        blocksHtml += `<ul style="${blockStyle} padding-left: 20px; list-style-type: disc;">${items.map(i => `<li style="${liStyle}">${esc(i)}</li>`).join('')}</ul>`;
      }
    } else if (b.type === 'num-list') {
      const items = (b.value || '').split('\n').filter(i => i.trim() !== '');
      if (items.length > 0) {
        const liStyle = `margin-bottom: 6px; text-align: ${align};`;
        blocksHtml += `<ol style="${blockStyle} padding-left: 20px; list-style-type: decimal;">${items.map(i => `<li style="${liStyle}">${esc(i)}</li>`).join('')}</ol>`;
      }
    }
  });

  // Attendee CTA logic
  let ctaHtml = '';
  if (settings.attendeeCta) {
    const yesLink = `${origin}/dashboard/events?rsvp=yes&event=${eventId}&email=${encodeURIComponent(recipientEmail)}`;
    const noLink = `${origin}/dashboard/events?rsvp=no&event=${eventId}&email=${encodeURIComponent(recipientEmail)}`;
    ctaHtml = `
      <div style="text-align: center; margin-top: 32px; margin-bottom: 32px;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${yesLink}" style="height:42px;v-text-anchor:middle;width:140px;" arcsize="15%" stroke="f" fillcolor="${ctaAffirm}">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">I will attend</center>
        </v:roundrect>
        <span style="display:inline-block; width: 12px;"></span>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${noLink}" style="height:42px;v-text-anchor:middle;width:140px;" arcsize="15%" stroke="f" fillcolor="${ctaNegative}">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:sans-serif;font-size:14px;font-weight:bold;">I will not attend</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <a href="${yesLink}" style="background-color:${ctaAffirm}; border-radius:6px; color:#ffffff; display:inline-block; font-family:sans-serif; font-size:14px; font-weight:700; line-height:42px; text-align:center; text-decoration:none; width:140px; -webkit-text-size-adjust:none; margin-right: 12px;">I will attend</a>
        <a href="${noLink}" style="background-color:${ctaNegative}; border-radius:6px; color:#ffffff; display:inline-block; font-family:sans-serif; font-size:14px; font-weight:700; line-height:42px; text-align:center; text-decoration:none; width:140px; -webkit-text-size-adjust:none;">I will not attend</a>
        <!--<![endif]-->
      </div>
    `;
  }

  const logoHtml = logo
    ? `<div style="text-align: ${align}; margin-bottom: 24px;"><img src="${logo}" alt="Company Logo" style="max-height: 48px; object-fit: contain;" /></div>`
    : '';

  const addressHtml = address
    ? `<div style="text-align: ${align}; border-top: 1px solid #e5e7eb; padding-top: 16px; margin-top: 36px; font-size: 11px; color: #9ca3af; font-family: sans-serif; line-height: 1.4;">${address}</div>`
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { margin: 0; padding: 0; background-color: #f3f4f6; }
      </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f3f4f6;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="center" style="padding: 32px 16px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: ${bgColor}; border: 1px solid #e5e7eb; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
              <tr>
                <td style="padding: 36px 32px;">
                  ${logoHtml}
                  ${blocksHtml}
                  ${ctaHtml}
                  ${socialHtml}
                  ${addressHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { companyId, eventId, subject, preheader, attendeeCta, blocks, settings, logo, address, testRecipient } = req.body;

  if (!companyId || !eventId || !subject || !blocks) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Database environment variables not configured.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // 1. Resolve tenant_id from companyId
    const { data: co, error: coErr } = await supabase
      .from('companies')
      .select('tenant_id')
      .eq('id', companyId)
      .maybeSingle();

    if (coErr || !co) {
      throw new Error(coErr?.message || 'Company not found.');
    }
    const tenantId = co.tenant_id;

    // 2. Fetch company HR integrations
    const { data: integration } = await supabase
      .from('company_integrations')
      .select('hr_sender_name, hr_resend_api_key, hr_resend_from_email, hr_smtp_host, hr_smtp_port, hr_smtp_user, hr_smtp_pass, resend_api_key, resend_from_email, smtp_host, smtp_port, smtp_user, smtp_pass')
      .eq('company_id', companyId)
      .maybeSingle();

    const activeResendApiKey = integration?.hr_resend_api_key || integration?.resend_api_key || RESEND_API_KEY;
    const activeEmailFrom = integration?.hr_resend_from_email || integration?.resend_from_email || EMAIL_FROM;
    const smtpUser = integration?.hr_smtp_user || integration?.smtp_user;
    const smtpPass = integration?.hr_smtp_pass || integration?.smtp_pass;
    const smtpHost = integration?.hr_smtp_host || integration?.smtp_host || 'smtp.gmail.com';
    const smtpPort = integration?.hr_smtp_port || integration?.smtp_port || 465;
    const senderName = integration?.hr_sender_name || 'BrightKey Solutions';

    // 3. Resolve recipient emails
    let emails = [];
    if (testRecipient) {
      emails = [testRecipient];
    } else {
      const { data: employees, error: empErr } = await supabase
        .from('tenant_members')
        .select('user_email')
        .eq('tenant_id', tenantId);

      if (empErr) throw empErr;

      emails = [...new Set(employees.map(e => e.user_email).filter(Boolean))];
    }

    if (emails.length === 0) {
      return res.status(400).json({ error: 'No recipient email addresses resolved.' });
    }

    // Determine request origin for link URLs
    let origin = 'https://brightkeysolutions.com';
    const referer = req.headers.referer || '';
    if (referer.includes('localhost') || referer.includes('127.0.0.1')) {
      origin = 'http://localhost:3000';
    }

    // 4. Setup sending transport/clients
    let sentCount = 0;
    const isSmtp = smtpUser && smtpPass;

    let transporter;
    if (isSmtp) {
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(smtpPort) || 465,
        secure: (parseInt(smtpPort) || 465) === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
    }

    // 5. Fetch company profile config for logo & footer
    const { data: coProfile } = await supabase
      .from('global_settings')
      .select('value')
      .eq('key', 'company_profile_config')
      .eq('company_id', companyId)
      .maybeSingle();

    let finalLogo = logo;
    let finalAddressHtml = address;
    if (coProfile?.value) {
      finalLogo = coProfile.value.logoDark || coProfile.value.logoLight || logo;
      const coName = coProfile.value.companyName || 'BrightKey Solutions';
      const addr1 = coProfile.value.companyAddressLine1 || '';
      const addr2 = coProfile.value.companyAddressLine2 || '';
      const coPhone = coProfile.value.phone || '';
      const coEmail = coProfile.value.email || '';

      finalAddressHtml = `
        <div style="font-weight: 700; margin-bottom: 2px;">${esc(coName)}</div>
        ${addr1 ? `<div>${esc(addr1)}</div>` : ''}
        ${addr2 ? `<div>${esc(addr2)}</div>` : ''}
        ${(coPhone || coEmail) ? `<div style="margin-top: 2px; color: #9ca3af;">${esc(coPhone)}${coPhone && coEmail ? ' | ' : ''}${esc(coEmail)}</div>` : ''}
      `.trim();
    }

    // Combine attendeeCta into compiler settings
    const compilerSettings = { ...settings, attendeeCta };

    // Send email to all resolved addresses
    for (const recipient of emails) {
      const compiledHtml = compileHtmlBody(blocks, compilerSettings, finalLogo, finalAddressHtml, eventId, recipient, origin);
      
      if (isSmtp) {
        let finalSmtpFrom = smtpUser;
        if (finalSmtpFrom && !finalSmtpFrom.includes('<')) {
          finalSmtpFrom = `"${senderName}" <${finalSmtpFrom}>`;
        }

        await transporter.sendMail({
          from: finalSmtpFrom,
          to: recipient,
          subject: subject,
          html: compiledHtml
        });
        sentCount++;
      } else if (activeResendApiKey) {
        let finalFrom = activeEmailFrom;
        if (finalFrom && !finalFrom.includes('<')) {
          finalFrom = `"${senderName}" <${finalFrom}>`;
        }

        const mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${activeResendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: finalFrom,
            to: recipient,
            subject: subject,
            html: compiledHtml
          })
        });

        if (mailRes.ok) {
          sentCount++;
        } else {
          const errData = await mailRes.json();
          console.error(`Resend failed for ${recipient}:`, errData);
        }
      }
    }

    return res.status(200).json({ success: true, count: sentCount });

  } catch (err) {
    console.error('Send custom email error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send emails.' });
  }
}
