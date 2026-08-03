import nodemailer from 'nodemailer';
import { createHash, randomBytes } from 'crypto';
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

function renderEmail(subject, preheader, blocks, employee, branding, companyProfile, actionUrl = '') {
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
              ${actionUrl ? `<p style="margin:30px 0;text-align:center;"><a href="${esc(actionUrl)}" style="display:inline-block;padding:12px 22px;border-radius:7px;background:#06b6d4;color:#fff;text-decoration:none;font-family:Arial,sans-serif;font-size:16px;font-weight:800;">Register to Directory</a></p>` : ''}
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

  const { companyId, applicationId, recipient, emailType, subject, preheader = '', blocks } = req.body || {};
  const isApplicantEmail = Boolean(applicationId);
  const isApplicantStatusEmail = isApplicantEmail && ['next_step', 'hire', 'rejection'].includes(emailType);
  const emailLabel = emailType === 'rejection' ? 'rejection email' : emailType === 'next_step' ? 'next-step email' : 'hire email';
  if (!companyId || !ALLOWED_EMAIL_TYPES.has(emailType) || (isApplicantEmail ? !isApplicantStatusEmail : (!recipient || !subject || !Array.isArray(blocks)))) {
    return res.status(400).json({ error: 'Complete the test email details and try again.' });
  }
  if (!isApplicantEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(recipient))) {
    return res.status(400).json({ error: 'Enter a valid test email address.' });
  }
  let supabase;
  let usesServiceRole = true;
  try {
    supabase = createServiceClient();
  } catch {
    usesServiceRole = false;
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
      scope: isApplicantEmail ? 'send-hiring-applicant-email' : 'send-hiring-test-email',
      identifier: `${companyId}:${access.user.id}`,
      limit: 20,
      windowSeconds: 600
    })) return;

    let normalizedRecipient = String(recipient || '').trim().toLowerCase();
    let recipientProfile;
    let resolvedTemplate = { subject, preheader, blocks };
    if (isApplicantEmail) {
      const [applicationResult, templatesResult] = await Promise.all([
        supabase.from('job_applications')
          .select('id, first_name, last_name, email, contact_number, job_title, status, current_stage, hired_at')
          .eq('company_id', companyId).eq('id', applicationId).maybeSingle(),
        supabase.from('global_settings').select('value')
          .eq('company_id', companyId).eq('key', 'hiring_email_templates').maybeSingle()
      ]);
      if (applicationResult.error || templatesResult.error) {
        console.error('Hiring applicant email context lookup failed:', applicationResult.error || templatesResult.error);
        return res.status(503).json({ error: `The ${emailLabel} could not be prepared. Try again shortly.` });
      }
      const application = applicationResult.data;
      const hasRequiredStatus = emailType === 'hire'
        ? Boolean(application?.hired_at) && application.status === 'approved'
        : emailType === 'rejection'
          ? application?.status === 'rejected'
          : application?.status === 'pending' && Number(application.current_stage) > 1;
      if (!hasRequiredStatus) {
        const requiredAction = emailType === 'hire' ? 'Hire' : emailType === 'rejection' ? 'Reject' : 'Move';
        return res.status(409).json({ error: `${requiredAction} the applicant before sending the ${emailLabel}.` });
      }
      const applicantTemplate = templatesResult.data?.value?.[emailType];
      if (!applicantTemplate || applicantTemplate.active !== true) {
        return res.status(200).json({ success: true, emailType, skipped: 'inactive' });
      }
      normalizedRecipient = String(application.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecipient)) {
        return res.status(400).json({ error: 'The applicant does not have a valid email address.' });
      }
      recipientProfile = application;
      resolvedTemplate = applicantTemplate;
    } else {
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
      if (!employee) return res.status(400).json({ error: 'Use an email address listed in the Employee Directory.' });
      recipientProfile = employee;
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
      return res.status(400).json({ error: `Configure the HR email integration before sending ${isApplicantEmail ? `${emailLabel}s` : 'a test'}.` });
    }

    const resolvedSubject = replaceHiringEmailPlaceholders(String(resolvedTemplate.subject || '').slice(0, 100), recipientProfile);
    const resolvedPreheader = replaceHiringEmailPlaceholders(String(resolvedTemplate.preheader || '').slice(0, 150), recipientProfile);
    const resolvedBlocks = Array.isArray(resolvedTemplate.blocks) ? resolvedTemplate.blocks : [];
    let actionUrl = '';
    if (isApplicantEmail && emailType === 'hire') {
      const registrationToken = randomBytes(32).toString('base64url');
      const registrationHash = createHash('sha256').update(registrationToken).digest('hex');
      const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
      const registrationResult = usesServiceRole
        ? await supabase.from('hiring_directory_registrations').upsert({
          company_id: companyId, application_id: applicationId, token_hash: registrationHash,
          expires_at: expiresAt, used_at: null
        }, { onConflict: 'application_id' })
        : await supabase.rpc('issue_hiring_directory_registration', {
          p_company_id: companyId,
          p_application_id: applicationId,
          p_token_hash: registrationHash,
          p_expires_at: expiresAt
        });
      if (registrationResult.error) {
        console.error('Hiring directory registration link creation failed:', registrationResult.error);
        return res.status(503).json({ error: 'The secure Register to Directory link could not be created. Try again shortly.' });
      }
      let origin = req.headers.referer ? new URL(req.headers.referer).origin : 'https://www.brightkeysolutions.com';
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) origin = 'https://www.brightkeysolutions.com';
      actionUrl = `${origin}/employee-hire-registration.html?application=${encodeURIComponent(applicationId)}&token=${encodeURIComponent(registrationToken)}`;
    }
    const html = renderEmail(resolvedSubject, resolvedPreheader, resolvedBlocks, recipientProfile, branding, companyProfile, actionUrl);
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
        console.error('Hiring email delivery failed:', await response.text());
        return res.status(502).json({ error: `${isApplicantEmail ? `The ${emailLabel}` : 'The test email'} could not be delivered. Check the HR email integration and try again.` });
      }
    }

    await writeSecurityAudit(supabase, {
      companyId,
      actorUserId: access.user.id,
      action: isApplicantEmail ? 'hiring_applicant_email_dispatch' : 'hiring_test_email_dispatch',
      targetType: isApplicantEmail ? 'job_application' : 'hiring_email_template',
      targetId: isApplicantEmail ? applicationId : companyId,
      metadata: { recipient: normalizedRecipient, email_type: emailType }
    });
    let hireEmailSentAt = null;
    if (isApplicantEmail && emailType === 'hire') {
      hireEmailSentAt = new Date().toISOString();
      const { error: sentStatusError } = await supabase.from('job_applications')
        .update({ hire_email_sent_at: hireEmailSentAt })
        .eq('company_id', companyId).eq('id', applicationId);
      if (sentStatusError) {
        console.error('Hire email sent-status update failed:', sentStatusError);
        return res.status(503).json({ error: 'The hire email was delivered, but its sent status could not be saved. Refresh before trying again.' });
      }
    }
    return res.status(200).json({ success: true, emailType, skipped: null, hireEmailSentAt });
  } catch (error) {
    console.error('Hiring email failed:', error);
    return res.status(500).json({ error: `${isApplicantEmail ? `The ${emailLabel}` : 'The test email'} could not be sent. Check the HR email integration and try again.` });
  }
}
