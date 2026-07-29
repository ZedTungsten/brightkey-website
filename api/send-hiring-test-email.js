import nodemailer from 'nodemailer';
import {
  createAuthenticatedClient,
  createServiceClient,
  getBearerToken,
  requireCompanyAccess,
  sendAccessError,
  writeSecurityAudit
} from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';
import { buildEmailBranding } from '../lib/api/email-branding.js';
import { buildEmailFooter } from '../lib/api/email-footer.js';
import { replaceHiringEmailPlaceholders } from '../lib/api/hiring-email-placeholders.js';

const ALLOWED_EMAIL_TYPES = new Set(['after_submission', 'next_step', 'requirements', 'hire', 'rejection']);

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function richText(value, employee) {
  const placeholders = [];
  let output = replaceHiringEmailPlaceholders(value, employee).replace(
    /\{\{(?:first_name|last_name|email|contact_number|job_title)\}\}/g,
    match => {
      placeholders.push(match);
      return `ZZHIRINGPLACEHOLDER${placeholders.length - 1}ZZ`;
    }
  );
  output = esc(output)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/\n/g, '<br>');
  placeholders.forEach((placeholder, index) => {
    output = output.replace(`ZZHIRINGPLACEHOLDER${index}ZZ`, esc(placeholder));
  });
  return output;
}

function renderBlocks(blocks, employee) {
  return blocks.slice(0, 30).map(block => {
    const type = String(block?.type || '');
    const value = replaceHiringEmailPlaceholders(String(block?.value || '').slice(0, 5000), employee);
    const base = 'margin:0 0 18px;color:#3f4148;font-family:Arial,sans-serif;font-size:14px;line-height:1.65;text-align:left;';
    if (type === 'header') return `<h1 style="${base}margin-bottom:28px;color:#111216;font-size:26px;line-height:1.25;font-weight:800;">${esc(value)}</h1>`;
    if (type === 'subheader') return `<h2 style="${base}color:#27282d;font-size:17px;font-weight:700;">${esc(value)}</h2>`;
    if (type === 'body') return `<p style="${base}">${richText(value, employee)}</p>`;
    if (type === 'signature') return `<p style="${base}margin-top:24px;">${richText(value, employee)}</p>`;
    if (type === 'bullet-list' || type === 'number-list') {
      const tag = type === 'bullet-list' ? 'ul' : 'ol';
      const items = value.split('\n').map(item => item.trim()).filter(Boolean);
      return `<${tag} style="${base}padding-left:22px;line-height:1.4;">${items.map(item => `<li style="margin-bottom:3px;line-height:1.4;">${richText(item, employee)}</li>`).join('')}</${tag}>`;
    }
    if (type === 'spacer') return '<div style="height:28px;line-height:28px;">&nbsp;</div>';
    if (type === 'hr') return '<hr style="margin:18px 0;border:0;border-top:1px solid #e5e7eb;">';
    return '';
  }).join('');
}

function renderEmail(subject, preheader, blocks, employee, branding, companyProfile) {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;">
          <tr><td style="padding:36px 32px;">
            ${branding.logoHtml}
            ${renderBlocks(blocks, employee)}
            ${buildEmailFooter(companyProfile)}
          </td></tr>
        </table>
      </td></tr>
    </table>
    <div style="display:none;">${esc(subject)}</div>
  </body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { companyId, recipient, emailType, subject, preheader = '', blocks } = req.body || {};
  if (!companyId || !recipient || !ALLOWED_EMAIL_TYPES.has(emailType) || !subject || !Array.isArray(blocks)) {
    return res.status(400).json({ error: 'Complete the test email details and try again.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipient))) {
    return res.status(400).json({ error: 'Enter a valid test email address.' });
  }
  let supabase;
  try {
    supabase = createServiceClient();
  } catch {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'Your session has expired. Sign in again and retry.' });
    try {
      supabase = createAuthenticatedClient(token);
    } catch (error) {
      console.error('Hiring test email database configuration failed:', error);
      return res.status(503).json({ error: 'The email service is temporarily unavailable.' });
    }
  }

  try {
    const access = await requireCompanyAccess(req, supabase, companyId, { modules: ['HR'] });
    if (access.error) return sendAccessError(res, access);
    if (!await enforceRateLimit({
      supabase,
      req,
      res,
      scope: 'send-hiring-test-email',
      identifier: `${companyId}:${access.user.id}`,
      limit: 20,
      windowSeconds: 600
    })) return;

    const normalizedRecipient = String(recipient).trim().toLowerCase();
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('first_name, last_name, email, contact_number, title')
      .eq('company_id', companyId)
      .eq('email', normalizedRecipient)
      .limit(1)
      .maybeSingle();
    if (employeeError) {
      console.error('Hiring test employee lookup failed:', employeeError);
      return res.status(503).json({ error: 'The employee directory could not be loaded. Try again shortly.' });
    }
    if (!employee) {
      return res.status(400).json({ error: 'Use an email address listed in the Employee Directory.' });
    }

    const [integrationResult, profileResult] = await Promise.all([
      supabase
        .from('company_integrations')
        .select('hr_sender_name, hr_resend_api_key, hr_resend_from_email, hr_smtp_host, hr_smtp_port, hr_smtp_user, hr_smtp_pass, resend_api_key, resend_from_email, smtp_host, smtp_port, smtp_user, smtp_pass')
        .eq('company_id', companyId)
        .maybeSingle(),
      supabase
        .from('global_settings')
        .select('value')
        .eq('company_id', companyId)
        .eq('key', 'company_profile_config')
        .maybeSingle()
    ]);
    const { data: integration, error: integrationError } = integrationResult;
    if (integrationError) {
      console.error('Hiring email integration lookup failed:', integrationError);
      return res.status(503).json({ error: 'The HR email integration could not be loaded. Try again shortly.' });
    }
    if (profileResult.error) {
      console.error('Hiring email company profile lookup failed:', profileResult.error);
      return res.status(503).json({ error: 'The company email branding could not be loaded. Try again shortly.' });
    }
    const companyProfile = profileResult.data?.value || {};
    const branding = buildEmailBranding(companyProfile);

    const senderName = integration?.hr_sender_name || 'BrightKey Hiring';
    const resendKey = integration?.hr_resend_api_key || integration?.resend_api_key;
    const resendFrom = integration?.hr_resend_from_email || integration?.resend_from_email;
    const smtpUser = integration?.hr_smtp_user || integration?.smtp_user;
    const smtpPass = integration?.hr_smtp_pass || integration?.smtp_pass;
    const smtpHost = integration?.hr_smtp_host || integration?.smtp_host;
    const smtpPort = Number(integration?.hr_smtp_port || integration?.smtp_port || 465);
    if (!resendKey && !(smtpUser && smtpPass)) {
      return res.status(400).json({ error: 'Configure the HR email integration before sending a test.' });
    }

    const resolvedSubject = replaceHiringEmailPlaceholders(String(subject).slice(0, 100), employee);
    const resolvedPreheader = replaceHiringEmailPlaceholders(String(preheader).slice(0, 150), employee);
    const html = renderEmail(resolvedSubject, resolvedPreheader, blocks, employee, branding, companyProfile);
    if (smtpUser && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass }
      });
      await transporter.sendMail({
        from: `"${senderName}" <${smtpUser}>`,
        to: normalizedRecipient,
        subject: resolvedSubject,
        html,
        attachments: branding.nodemailerAttachments
      });
    } else {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: resendFrom?.includes('<') ? resendFrom : `"${senderName}" <${resendFrom}>`,
          to: normalizedRecipient,
          subject: resolvedSubject,
          html,
          attachments: branding.resendAttachments
        })
      });
      if (!response.ok) {
        console.error('Hiring test email delivery failed:', await response.text());
        return res.status(502).json({ error: 'The test email could not be delivered. Check the HR email integration and try again.' });
      }
    }

    await writeSecurityAudit(supabase, {
      companyId,
      actorUserId: access.user.id,
      action: 'hiring_test_email_dispatch',
      targetType: 'hiring_email_template',
      targetId: companyId,
      metadata: { recipient: normalizedRecipient, employee_email: employee.email, email_type: emailType }
    });
    return res.status(200).json({ success: true, emailType });
  } catch (error) {
    console.error('Hiring test email failed:', error);
    return res.status(500).json({ error: 'The test email could not be sent. Check the HR email integration and try again.' });
  }
}
