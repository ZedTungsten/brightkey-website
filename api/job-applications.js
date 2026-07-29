import { createServiceClient, setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';

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
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'job_application_forms')
    .maybeSingle();
  if (settingsError) throw settingsError;

  const form = settings?.value?.[job.id] || {};
  return {
    job,
    fields: Array.isArray(form.customFields) ? form.customFields.slice(0, 50) : []
  };
}

function normalizeAnswer(field, rawAnswer, fileData, companyId, applicationId, index) {
  const type = cleanText(field?.type || 'short', 24);
  const options = Array.isArray(field?.options)
    ? field.options.map(option => cleanText(option, 200)).filter(Boolean).slice(0, 10)
    : [];
  let answer = null;
  let file = null;

  if (type === 'checkboxes') {
    const values = Array.isArray(rawAnswer) ? rawAnswer : [];
    answer = [...new Set(values.map(value => cleanText(value, 200)).filter(value => options.includes(value)))].slice(0, 10);
  } else if (type === 'radio' || type === 'slider') {
    const value = cleanText(rawAnswer, 200);
    answer = options.includes(value) ? value : '';
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

    return res.status(201).json({ success: true, applicationId });
  } catch (error) {
    console.error('Job application error:', error);
    return res.status(500).json({ error: 'Your application could not be submitted. Please try again.' });
  }
}
