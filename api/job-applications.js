import { createServiceClient, setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';
import nodemailer from 'nodemailer';
import { buildEmailBranding } from '../lib/api/email-branding.js';
import { buildEmailFooter } from '../lib/api/email-footer.js';
import { replaceHiringEmailPlaceholders } from '../lib/api/hiring-email-placeholders.js';

const APPLICATION_BUCKET = 'brightkey-internal';
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'pdf', 'heic', 'gif']);
const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  heic: 'image/heic',
  gif: 'image/gif'
};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Za-z0-9_-]{5}$/;
const DEFAULT_CONFIRMATION_TEMPLATE = {
  active: true,
  subject: 'We received your BrightKey application',
  preheader: 'Thank you for applying. Your application has been received.',
  blocks: [
    { type: 'header', value: 'Application received' },
    { type: 'body', value: 'Hi {{first_name}},\n\nThank you for applying for the {{job_title}} position at BrightKey.' },
    { type: 'body', value: 'Our hiring team has received your application and will review your qualifications. We will contact you if your application moves forward.' },
    { type: 'signature', value: 'Best regards,\nBrightKey Hiring Team' }
  ]
};

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function safeFileName(value) {
  return String(value || 'file').replace(/[^A-Za-z0-9._-]/g, '_').slice(-160);
}

function extensionOf(value) {
  return String(value || '').split('.').pop()?.toLowerCase() || '';
}

async function loadJobAndForm(supabase, companyId, jobCode) {
  const { data: job, error: jobError } = await supabase
    .from('job_posts')
    .select('id, company_id, public_code, job_title, status')
    .eq('company_id', companyId)
    .eq('public_code', jobCode)
    .eq('status', 'posted')
    .maybeSingle();
  if (jobError) throw jobError;
  if (!job) return null;

  const { data: settings, error: settingsError } = await supabase
    .from('global_settings')
    .select('key, value')
    .eq('company_id', companyId)
    .in('key', ['job_application_forms', 'hiring_email_templates', 'company_profile_config']);
  if (settingsError) throw settingsError;

  const settingsByKey = Object.fromEntries((settings || []).map(row => [row.key, row.value]));
  const form = settingsByKey.job_application_forms?.[job.id] || {};
  return {
    job,
    fields: Array.isArray(form.customFields) ? form.customFields.slice(0, 50) : [],
    confirmationTemplate: settingsByKey.hiring_email_templates?.after_submission || null,
    companyProfile: settingsByKey.company_profile_config || {}
  };
}

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function replaceApplicationPlaceholders(value, applicant, jobTitle) {
  return replaceHiringEmailPlaceholders(value, { ...applicant, jobTitle });
}

function renderConfirmationBlocks(blocks, applicant, jobTitle) {
  return (Array.isArray(blocks) ? blocks : []).slice(0, 30).map(block => {
    const type = String(block?.type || '');
    const value = replaceApplicationPlaceholders(String(block?.value || '').slice(0, 5000), applicant, jobTitle);
    const text = escHtml(value).replace(/\n/g, '<br>');
    const base = 'margin:0 0 18px;color:#3f4148;font-family:Arial,sans-serif;font-size:14px;line-height:1.65;text-align:left;';
    if (type === 'header') return `<h1 style="${base}margin-bottom:28px;color:#111216;font-size:26px;line-height:1.25;font-weight:800;">${text}</h1>`;
    if (type === 'subheader') return `<h2 style="${base}color:#27282d;font-size:17px;font-weight:700;">${text}</h2>`;
    if (type === 'body' || type === 'signature') return `<p style="${base}${type === 'signature' ? 'margin-top:24px;' : ''}">${text}</p>`;
    if (type === 'bullet-list' || type === 'number-list') {
      const tag = type === 'bullet-list' ? 'ul' : 'ol';
      const items = value.split('\n').map(item => item.trim()).filter(Boolean);
      return `<${tag} style="${base}padding-left:22px;line-height:1.4;">${items.map(item => `<li style="margin-bottom:3px;line-height:1.4;">${escHtml(item)}</li>`).join('')}</${tag}>`;
    }
    if (type === 'spacer') return '<div style="height:28px;line-height:28px;">&nbsp;</div>';
    if (type === 'hr') return '<hr style="margin:18px 0;border:0;border-top:1px solid #e5e7eb;">';
    return '';
  }).join('');
}

async function sendApplicationConfirmation(supabase, companyId, template, applicant, jobTitle, companyProfile) {
  const activeTemplate = template && typeof template === 'object'
    ? { ...DEFAULT_CONFIRMATION_TEMPLATE, ...template }
    : DEFAULT_CONFIRMATION_TEMPLATE;
  if (activeTemplate.active === false) return;
  const { data: integration, error } = await supabase
    .from('company_integrations')
    .select('hr_sender_name, hr_resend_api_key, hr_resend_from_email, hr_smtp_host, hr_smtp_port, hr_smtp_user, hr_smtp_pass, resend_api_key, resend_from_email, smtp_host, smtp_port, smtp_user, smtp_pass')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw error;

  const senderName = integration?.hr_sender_name || 'BrightKey Hiring';
  const resendKey = integration?.hr_resend_api_key || integration?.resend_api_key;
  const resendFrom = integration?.hr_resend_from_email || integration?.resend_from_email;
  const smtpUser = integration?.hr_smtp_user || integration?.smtp_user;
  const smtpPass = integration?.hr_smtp_pass || integration?.smtp_pass;
  const smtpHost = integration?.hr_smtp_host || integration?.smtp_host;
  const smtpPort = Number(integration?.hr_smtp_port || integration?.smtp_port || 465);
  if (!(resendKey && resendFrom) && !(smtpUser && smtpPass)) return;

  const subject = replaceApplicationPlaceholders(activeTemplate.subject, applicant, jobTitle).slice(0, 100);
  const preheader = replaceApplicationPlaceholders(activeTemplate.preheader, applicant, jobTitle).slice(0, 150);
  const content = renderConfirmationBlocks(activeTemplate.blocks, applicant, jobTitle);
  const branding = buildEmailBranding(companyProfile);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escHtml(preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;"><tr><td style="padding:36px 32px;">${branding.logoHtml}${content}${buildEmailFooter(companyProfile)}</td></tr></table></td></tr></table></body></html>`;

  if (smtpUser && smtpPass) {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });
    await transporter.sendMail({
      from: `"${senderName}" <${smtpUser}>`,
      to: applicant.email,
      subject,
      html,
      attachments: branding.nodemailerAttachments
    });
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: resendFrom?.includes('<') ? resendFrom : `"${senderName}" <${resendFrom}>`,
      to: applicant.email,
      subject,
      html,
      attachments: branding.resendAttachments
    })
  });
  if (!response.ok) throw new Error('Application confirmation delivery failed.');
}

function normalizeAnswer(field, rawAnswer, fileData, companyId, applicationId, index) {
  const type = cleanText(field?.type || 'short', 24);
  const options = Array.isArray(field?.options)
    ? field.options.map(option => cleanText(option, 200)).filter(Boolean).slice(0, 10)
    : [];
  const allowSpecify = field?.allowSpecify === true;
  const lastOption = options[options.length - 1] || '';
  const normalizeChoice = value => {
    const cleaned = cleanText(value, 400);
    if (allowSpecify && cleaned === lastOption) return '';
    if (options.includes(cleaned)) return cleaned;
    const specifyPrefix = `${lastOption}: `;
    if (allowSpecify && lastOption && cleaned.startsWith(specifyPrefix)) {
      const specified = cleanText(cleaned.slice(specifyPrefix.length), 180);
      return specified ? `${lastOption}: ${specified}` : '';
    }
    return '';
  };
  let answer = null;
  let file = null;

  if (type === 'checkboxes') {
    const values = Array.isArray(rawAnswer) ? rawAnswer : [];
    answer = [...new Set(values.map(normalizeChoice).filter(Boolean))].slice(0, 11);
  } else if (type === 'radio' || type === 'slider') {
    answer = type === 'radio'
      ? normalizeChoice(rawAnswer)
      : (options.includes(cleanText(rawAnswer, 200)) ? cleanText(rawAnswer, 200) : '');
  } else if (type === 'date') {
    const value = cleanText(rawAnswer, 10);
    answer = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  } else if (type === 'upload') {
    const expectedPrefix = `companies/${companyId}/job-applications/${applicationId}/q${index}_`;
    const path = cleanText(fileData?.path, 700);
    if (path && path.startsWith(expectedPrefix)) {
      file = {
        bucket: APPLICATION_BUCKET,
        path,
        name: safeFileName(fileData?.name),
        contentType: cleanText(fileData?.contentType, 120),
        size: Number(fileData?.size) || 0
      };
    }
  } else {
    answer = cleanText(rawAnswer, type === 'long' ? 500 : 300);
  }

  return {
    index,
    question: cleanText(field?.question || `Question ${index + 1}`, 500),
    type,
    answer,
    file
  };
}

async function storageObjectExists(supabase, file) {
  if (!file?.path || file.size <= 0 || file.size > MAX_FILE_BYTES) return false;
  const slashIndex = file.path.lastIndexOf('/');
  const folder = file.path.slice(0, slashIndex);
  const fileName = file.path.slice(slashIndex + 1);
  const { data, error } = await supabase.storage
    .from(APPLICATION_BUCKET)
    .list(folder, { limit: 10, search: fileName });
  if (error) throw error;
  return (data || []).some(item => item.name === fileName);
}

export default async function handler(req, res) {
  setApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'This application endpoint only accepts submissions.' });
  }

  let supabase;
  try {
    supabase = createServiceClient();
  } catch (error) {
    console.error('Job application configuration error:', error);
    return res.status(503).json({ error: 'Applications are temporarily unavailable. Please try again later.' });
  }

  try {
    const action = cleanText(req.body?.action, 30);
    const companyId = cleanText(req.body?.companyId, 36);
    const jobCode = cleanText(req.body?.jobCode, 5);
    const applicationId = cleanText(req.body?.applicationId, 36);

    if (!UUID_PATTERN.test(companyId) || !UUID_PATTERN.test(applicationId) || !CODE_PATTERN.test(jobCode)) {
      return res.status(400).json({ error: 'This job application link is invalid. Refresh the page and try again.' });
    }

    const context = await loadJobAndForm(supabase, companyId, jobCode);
    if (!context) {
      return res.status(404).json({ error: 'This job opening is no longer accepting applications.' });
    }

    if (action === 'prepare_upload') {
      if (!await enforceRateLimit({
        supabase,
        req,
        res,
        scope: 'job-application-upload',
        identifier: `${companyId}:${jobCode}`,
        limit: 30,
        windowSeconds: 3600
      })) return;

      const questionIndex = Number(req.body?.questionIndex);
      const fileName = safeFileName(req.body?.fileName);
      const fileSize = Number(req.body?.fileSize);
      const extension = extensionOf(fileName);
      const contentType = CONTENT_TYPES[extension];
      const expectedField = context.fields[questionIndex];
      if (!Number.isInteger(questionIndex) || expectedField?.type !== 'upload') {
        return res.status(400).json({ error: 'The selected application field does not accept a file.' });
      }
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        return res.status(400).json({ error: 'Choose a JPG, JPEG, PNG, PDF, HEIC, or GIF file.' });
      }
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_BYTES) {
        return res.status(400).json({ error: 'Choose a file that is 15 MB or smaller.' });
      }

      const { data: quotaRows, error: quotaError } = await supabase.rpc('check_company_storage_quota', {
        p_company_id: companyId,
        p_incoming_bytes: fileSize
      });
      if (quotaError) throw quotaError;
      if (!quotaRows?.[0]?.allowed) {
        return res.status(413).json({ error: 'File storage is currently full. Contact the hiring team for assistance.' });
      }

      const path = `companies/${companyId}/job-applications/${applicationId}/q${questionIndex}_${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from(APPLICATION_BUCKET)
        .createSignedUploadUrl(path);
      if (error) throw error;
      return res.status(200).json({
        bucket: APPLICATION_BUCKET,
        path,
        token: data.token,
        contentType
      });
    }

    if (action !== 'submit') {
      return res.status(400).json({ error: 'The application request is incomplete.' });
    }

    const email = cleanText(req.body?.email, 254).toLowerCase();
    if (!await enforceRateLimit({
      supabase,
      req,
      res,
      scope: 'job-application-submit',
      identifier: `${companyId}:${jobCode}:${email}`,
      limit: 5,
      windowSeconds: 3600
    })) return;

    const firstName = cleanText(req.body?.firstName, 120);
    const lastName = cleanText(req.body?.lastName, 120);
    const contactNumber = cleanText(req.body?.contactNumber, 30);
    const address = cleanText(req.body?.address, 500);
    if (!firstName || !lastName || !address || !/^\d{7,20}$/.test(contactNumber) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Complete your name, address, contact number, and valid email before submitting.' });
    }
    if (req.body?.certified !== true) {
      return res.status(400).json({ error: 'Confirm the application certification before submitting.' });
    }

    const rawAnswers = Array.isArray(req.body?.answers) ? req.body.answers : [];
    const rawByIndex = new Map(rawAnswers.map(item => [Number(item?.index), item]));
    const answers = context.fields.map((field, index) => {
      const raw = rawByIndex.get(index) || {};
      return normalizeAnswer(field, raw.answer, raw.file, companyId, applicationId, index);
    });

    const attachedFiles = answers.filter(answer => answer.type === 'upload' && answer.file).map(answer => answer.file);
    const verifiedFiles = await Promise.all(attachedFiles.map(file => storageObjectExists(supabase, file)));
    if (verifiedFiles.some(exists => !exists)) {
      return res.status(400).json({ error: 'An uploaded application file could not be verified. Choose the file again and retry.' });
    }

    const { error: insertError } = await supabase.from('job_applications').insert({
      id: applicationId,
      company_id: companyId,
      job_post_id: context.job.id,
      job_public_code: context.job.public_code,
      job_title: context.job.job_title,
      first_name: firstName,
      last_name: lastName,
      contact_number: contactNumber,
      email,
      address,
      answers,
      status: 'pending',
      certified_at: new Date().toISOString()
    });
    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(409).json({ error: 'This application was already submitted.' });
      }
      throw insertError;
    }

    try {
      await sendApplicationConfirmation(supabase, companyId, context.confirmationTemplate, {
        firstName,
        lastName,
        contactNumber,
        email
      }, context.job.job_title, context.companyProfile);
    } catch (emailError) {
      console.error('Application confirmation email failed:', emailError);
    }

    return res.status(201).json({ success: true, applicationId });
  } catch (error) {
    console.error('Job application error:', error);
    return res.status(500).json({ error: 'Your application could not be submitted. Please try again.' });
  }
}
