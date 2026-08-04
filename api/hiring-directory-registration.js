import { createHash, randomUUID } from 'crypto';
import { createServiceClient, setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const UPLOAD_TYPES = {
  profile: { bucket: 'brightkey-assets', mimes: ['image/jpeg', 'image/png', 'image/webp'], field: 'picture_link' },
  govid: { bucket: 'brightkey-internal', mimes: ['image/jpeg', 'image/png', 'image/webp'], field: 'gov_id_link' },
  cv: { bucket: 'brightkey-internal', mimes: ['application/pdf'], field: 'cv_link' },
  payout: { bucket: 'brightkey-internal', mimes: ['image/jpeg', 'image/png', 'image/webp'], field: 'payout_details_image' }
};

const clean = (value, max = 250) => String(value || '').trim().slice(0, max);
const tokenHash = token => createHash('sha256').update(String(token || '')).digest('hex');
const formatShiftTime = value => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return clean(value, 20) || null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return clean(value, 20) || null;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${suffix}`;
};
const validDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value <= new Date().toISOString().slice(0, 10);
};
const validPhone = value => /^\+?[0-9 ()-]{7,24}$/.test(clean(value, 30));

async function loadRegistration(supabase, applicationId, token) {
  if (!UUID.test(String(applicationId || '')) || !token) return null;
  const { data: registration } = await supabase.from('hiring_directory_registrations')
    .select('id, company_id, application_id, expires_at, used_at')
    .eq('application_id', applicationId).eq('token_hash', tokenHash(token)).maybeSingle();
  if (!registration || registration.used_at || new Date(registration.expires_at).getTime() <= Date.now()) return null;
  return registration;
}

async function loadContext(supabase, registration) {
  const { data: application } = await supabase.from('job_applications')
    .select('id, company_id, job_post_id, first_name, last_name, email, address, contact_number, status, hired_at')
    .eq('company_id', registration.company_id).eq('id', registration.application_id).maybeSingle();
  if (!application?.hired_at || application.status !== 'approved') return null;
  const { data: job } = await supabase.from('job_posts')
    .select('id, company_id, employment_type, position, department_name, visibility_level, job_title, job_description, salary_mode, monthly_salary, fixed_price, reporting_days, reporting_time_start, reporting_time_end, free_hours')
    .eq('company_id', registration.company_id).eq('id', application.job_post_id).maybeSingle();
  return job ? { application, job } : null;
}

function publicContext(context) {
  const { application } = context;
  return {
    firstName: application.first_name,
    lastName: application.last_name,
    email: application.email,
    address: application.address,
    contactNumber: application.contact_number
  };
}

function safeUploadPath(registration, type, fileName) {
  const safeName = clean(fileName, 120).replace(/[^A-Za-z0-9._-]/g, '_');
  return `companies/${registration.company_id}/employees/hire-${registration.application_id}/${type}/${Date.now()}_${safeName}`;
}

async function uploadFile(supabase, registration, body) {
  const config = UPLOAD_TYPES[body.uploadType];
  const match = String(body.fileBase64 || '').match(/^data:([^;]+);base64,(.+)$/s);
  if (!config || !match || !config.mimes.includes(match[1])) throw new Error('invalid_upload');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new Error('invalid_upload');
  const { data: quotaRows, error: quotaError } = await supabase.rpc('check_company_storage_quota', {
    p_company_id: registration.company_id, p_incoming_bytes: buffer.length
  });
  if (quotaError) throw new Error('storage_unavailable');
  if (!quotaRows?.[0]?.allowed) throw new Error('storage_full');
  const path = safeUploadPath(registration, body.uploadType, body.fileName);
  const { error } = await supabase.storage.from(config.bucket).upload(path, buffer, { contentType: match[1], upsert: false });
  if (error) throw error;
  return { bucket: config.bucket, path, field: config.field };
}

function validateUpload(upload, registration, expectedType) {
  const config = UPLOAD_TYPES[expectedType];
  const prefix = `companies/${registration.company_id}/employees/hire-${registration.application_id}/${expectedType}/`;
  return upload?.bucket === config.bucket && String(upload?.path || '').startsWith(prefix) ? upload : null;
}

async function fileUrl(supabase, upload) {
  if (upload.bucket === 'brightkey-assets') return supabase.storage.from(upload.bucket).getPublicUrl(upload.path).data.publicUrl;
  const { data, error } = await supabase.storage.from(upload.bucket).createSignedUrl(upload.path, 315360000);
  if (error) throw error;
  return data.signedUrl;
}

export default async function handler(req, res) {
  setApiCors(req, res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method Not Allowed' });
  const applicationId = req.method === 'GET' ? req.query.application : req.body?.applicationId;
  const token = req.method === 'GET' ? req.query.token : req.body?.token;
  const supabase = createServiceClient();
  if (!await enforceRateLimit({ supabase, req, res, scope: 'hiring-directory-registration', identifier: String(applicationId || ''), limit: 80, windowSeconds: 3600 })) return;
  try {
    const registration = await loadRegistration(supabase, applicationId, token);
    if (!registration) return res.status(410).json({ error: 'This registration link is invalid, expired, or already used.' });
    const context = await loadContext(supabase, registration);
    if (!context) return res.status(409).json({ error: 'This applicant is not eligible for Directory registration.' });
    if (req.method === 'GET') return res.status(200).json({ success: true, applicant: publicContext(context) });
    if (req.body?.action === 'upload') {
      const upload = await uploadFile(supabase, registration, req.body);
      return res.status(200).json({ success: true, upload });
    }
    if (req.body?.action !== 'complete') return res.status(400).json({ error: 'Choose a valid registration action.' });
    const fields = req.body.fields || {};
    const profile = validateUpload(req.body.uploads?.profile, registration, 'profile');
    const govid = validateUpload(req.body.uploads?.govid, registration, 'govid');
    const cv = validateUpload(req.body.uploads?.cv, registration, 'cv');
    const payout = req.body.uploads?.payout ? validateUpload(req.body.uploads.payout, registration, 'payout') : null;
    const payoutMode = fields.payoutMode === 'qr' ? 'qr' : fields.payoutMode === 'account' ? 'account' : '';
    const required = ['city', 'province', 'emergencyContactName'];
    const payoutValid = payoutMode === 'qr' ? Boolean(payout) : payoutMode === 'account' && Boolean(clean(fields.payoutDetails, 500));
    if (required.some(key => !clean(fields[key])) || !validDate(fields.dateOfBirth) || !validPhone(fields.emergencyContactNumber) || !profile || !govid || !cv || !payoutValid || !EMAIL.test(context.application.email)) {
      return res.status(400).json({ error: 'Complete all required fields and uploads before registering.' });
    }
    const { data: existing } = await supabase.from('employees').select('id')
      .eq('company_id', registration.company_id).eq('email', context.application.email.toLowerCase()).maybeSingle();
    if (existing) return res.status(409).json({ error: 'An Employee Directory entry already exists for this email.' });
    const [pictureLink, govIdLink, cvLink, payoutLink] = await Promise.all([
      fileUrl(supabase, profile), fileUrl(supabase, govid), fileUrl(supabase, cv), payout ? fileUrl(supabase, payout) : null
    ]);
    const { data: employeeNumber, error: employeeNumberError } = await supabase.rpc('next_company_employee_number', {
      p_company_id: registration.company_id
    });
    if (employeeNumberError || !employeeNumber) throw new Error('employee_number_unavailable');
    const job = context.job;
    const shiftTime = job.free_hours
      ? 'Free hours'
      : [formatShiftTime(job.reporting_time_start), formatShiftTime(job.reporting_time_end)].filter(Boolean).join(' - ') || null;
    const employee = {
      id: randomUUID(), company_id: registration.company_id, employee_number: employeeNumber,
      hiring_application_id: context.application.id,
      first_name: context.application.first_name, middle_name: clean(fields.middleName) || null, last_name: context.application.last_name,
      date_of_birth: fields.dateOfBirth, address: context.application.address, city: clean(fields.city), province: clean(fields.province),
      contact_number: context.application.contact_number,
      emergency_contact_number: `${clean(fields.emergencyContactName)} — ${clean(fields.emergencyContactNumber)}`,
      email: context.application.email.toLowerCase(), department: job.department_name || null, title: job.position || job.job_title,
      level: job.visibility_level || null, employment_status: 'Active', date_hired: new Date().toISOString().slice(0, 10),
      salary: job.salary_mode === 'range' ? null : job.monthly_salary ?? job.fixed_price ?? null, job_description: job.job_description,
      shift_days: Array.isArray(job.reporting_days) ? job.reporting_days.join(', ') : null, shift_time_1: shiftTime,
      tin: clean(fields.tin) || null, sss: clean(fields.sss) || null, pagibig: clean(fields.pagibig) || null,
      philhealth: clean(fields.philhealth) || null, picture_link: pictureLink, gov_id_link: govIdLink, cv_link: cvLink,
      payout_details: payoutMode === 'account' ? clean(fields.payoutDetails, 500) : null,
      payout_details_image: payoutMode === 'qr' ? payoutLink : null
    };
    const { data: consumed, error: consumeError } = await supabase.from('hiring_directory_registrations')
      .update({ used_at: new Date().toISOString() }).eq('id', registration.id).is('used_at', null).select('id').maybeSingle();
    if (consumeError || !consumed) return res.status(410).json({ error: 'This registration link has already been used.' });
    const { error: insertError } = await supabase.from('employees').insert(employee);
    if (insertError) {
      await supabase.from('hiring_directory_registrations').update({ used_at: null }).eq('id', registration.id);
      throw insertError;
    }
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('Hiring Directory registration failed:', error);
    const invalidUpload = error.message === 'invalid_upload';
    const storageFull = error.message === 'storage_full';
    const storageUnavailable = error.message === 'storage_unavailable';
    const employeeNumberUnavailable = error.message === 'employee_number_unavailable';
    const message = invalidUpload ? 'Choose a supported file under 3 MB.'
      : storageFull ? 'This company has reached its storage limit. Contact HR before trying again.'
        : storageUnavailable ? 'Storage availability could not be verified. Please try again shortly.'
          : employeeNumberUnavailable ? 'An employee number could not be generated. Contact HR before trying again.'
          : 'Registration could not be completed. Please try again.';
    return res.status(invalidUpload ? 400 : storageFull ? 413 : storageUnavailable ? 503 : 500).json({ error: message });
  }
}
