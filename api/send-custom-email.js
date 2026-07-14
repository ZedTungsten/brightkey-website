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
