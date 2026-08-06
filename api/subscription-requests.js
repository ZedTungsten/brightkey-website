import { createHash, randomBytes } from 'crypto';
import { createServiceClient, setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^[+0-9()\-\s]{7,24}$/;

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function loadPlatformSignupEmailIntegration(supabase) {
  const { data: platformEmail, error: platformEmailError } = await supabase
    .from('platform_email_integrations')
    .select('sender_name,api_key,integration_email')
    .eq('provider', 'resend')
    .maybeSingle();
  if (platformEmailError) throw platformEmailError;
  if (!platformEmail?.sender_name || !platformEmail?.api_key || !platformEmail?.integration_email) {
    throw new Error('Tenant signup email integration is not configured.');
  }
  return platformEmail;
}

async function sendFreeSignupAccountInvitation({ supabase, platformEmail, registration, email, firstName, lastName, companyName }) {
  const tenantId = registration?.tenant_id;
  const companyId = registration?.company_id;
  if (!tenantId || !companyId) throw new Error('Free signup did not return a tenant and company.');

  const resendApiKey = platformEmail.api_key;

  const normalizedEmail = email.toLowerCase().trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const inviteToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
  const expiresAt = new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString();

  const { error: deleteError } = await supabase.from('company_invitations')
    .delete().eq('tenant_id', tenantId).eq('email', normalizedEmail);
  if (deleteError) throw deleteError;

  const { error: invitationError } = await supabase.from('company_invitations').insert({
    tenant_id: tenantId,
    company_id: companyId,
    email: normalizedEmail,
    full_name: fullName,
    role: 'owner',
    invited_by: null,
    token_hash: tokenHash,
    expires_at: expiresAt,
    used_at: null
  });
  if (invitationError) throw invitationError;

  const configuredSiteUrl = String(process.env.PUBLIC_SITE_URL || 'https://www.brightkeysolutions.com').replace(/\/$/, '');
  const siteUrl = /^https?:\/\//i.test(configuredSiteUrl) ? configuredSiteUrl : 'https://www.brightkeysolutions.com';
  const inviteLink = `${siteUrl}/account-registration?tenant=${encodeURIComponent(tenantId)}&company=${encodeURIComponent(companyId)}&role=owner&email=${encodeURIComponent(normalizedEmail)}&sig=${encodeURIComponent(inviteToken)}`;
  const senderName = platformEmail.sender_name;
  const integrationEmail = platformEmail.integration_email;
  const from = integrationEmail.includes('<') ? integrationEmail : `${senderName} <${integrationEmail}>`;
  const subject = `Create your ${companyName} BrightKey account`.slice(0, 100);
  const html = `
    <div style="font-family:Arial,sans-serif;padding:24px;color:#374151;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;background:#ffffff;">
      <h2 style="color:#0891b2;margin:0 0 20px;text-align:center;">Welcome to BrightKey</h2>
      <p>Hello ${escapeHtml(fullName)},</p>
      <p>Your ${escapeHtml(companyName)} workspace is ready. Create your password to activate the owner account and access your BrightKey dashboard.</p>
      <p style="margin:24px 0;text-align:center;">
        <a href="${escapeHtml(inviteLink)}" style="background:#06b6d4;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;display:inline-block;">Create Account</a>
      </p>
      <p style="font-size:13px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;">This secure, single-use link expires in 72 hours. If you did not request this account, you can ignore this email.</p>
    </div>`;

  const mailResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: normalizedEmail, subject, html })
  });
  if (!mailResponse.ok) {
    console.error('Free signup account email failed:', await mailResponse.text());
    throw new Error('Account email could not be sent.');
  }
}

export default async function handler(req, res) {
  setApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const body = req.body || {};
  if (cleanText(body.website, 120)) return res.status(200).json({ success: true });

  const planId = cleanText(body.plan_id, 40);
  const firstName = cleanText(body.first_name, 80);
  const lastName = cleanText(body.last_name, 80);
  const businessEmail = cleanText(body.business_email, 180).toLowerCase();
  const mobileNumber = cleanText(body.mobile_number, 24);
  const companyName = cleanText(body.company, 140);
  const streetAddress = cleanText(body.street_address, 180);
  const city = cleanText(body.city, 100);
  const province = cleanText(body.province, 100);
  const country = cleanText(body.country, 100);

  if (!UUID_PATTERN.test(planId)) return res.status(400).json({ error: 'Select a valid subscription plan.' });
  if (!firstName || !lastName || !companyName || !streetAddress || !city || !province || !country) {
    return res.status(400).json({ error: 'Complete all required subscription details.' });
  }
  if (!EMAIL_PATTERN.test(businessEmail)) return res.status(400).json({ error: 'Enter a valid business email address.' });
  if (!MOBILE_PATTERN.test(mobileNumber)) return res.status(400).json({ error: 'Enter a valid mobile number.' });
  if (body.consent !== true) return res.status(400).json({ error: 'Confirm that Brightkey may contact you about this subscription.' });

  try {
    const supabase = createServiceClient();
    if (!await enforceRateLimit({
      supabase,
      req,
      res,
      scope: 'public-subscription-request',
      identifier: businessEmail,
      limit: 6,
      windowSeconds: 3600
    })) return;

    const { data: tier, error: tierError } = await supabase
      .from('pricing_tiers')
      .select('id, name, price_php')
      .eq('id', planId)
      .eq('is_visible', true)
      .maybeSingle();
    if (tierError) throw tierError;
    if (!tier) return res.status(400).json({ error: 'This subscription plan is no longer available.' });

    const { data: paymentRows, error: paymentError } = await supabase
      .from('platform_payment_integrations')
      .select('provider')
      .eq('is_active', true)
      .not('public_key', 'is', null)
      .not('secret_key', 'is', null)
      .limit(1);
    if (paymentError) throw paymentError;

    const freeSignup = !paymentRows?.length;
    const platformEmail = freeSignup ? await loadPlatformSignupEmailIntegration(supabase) : null;
    const { data: registration, error: registrationError } = await supabase.rpc('register_subscription_request', {
      p_pricing_tier_id: tier.id,
      p_plan_name: tier.name,
      p_first_name: firstName,
      p_last_name: lastName,
      p_business_email: businessEmail,
      p_mobile_number: mobileNumber,
      p_company_name: companyName,
      p_street_address: streetAddress,
      p_city: city,
      p_province: province,
      p_country: country,
      p_register_tenant: freeSignup
    });
    if (registrationError) throw registrationError;

    if (freeSignup) {
      await sendFreeSignupAccountInvitation({
        supabase,
        platformEmail,
        registration,
        email: businessEmail,
        firstName,
        lastName,
        companyName
      });
    }

    return res.status(201).json({
      success: true,
      signup_mode: freeSignup ? 'free' : 'payment_required',
      tenant_registered: Boolean(registration?.tenant_id),
      account_email_sent: freeSignup
    });
  } catch (error) {
    console.error('Subscription request failed:', error);
    if (String(error?.code || '') === '23505' || /already has a BrightKey account or subscription request/i.test(String(error?.message || ''))) {
      return res.status(409).json({
        error: 'This email is already registered or has an existing subscription request. Please sign in or use a different email.'
      });
    }
    return res.status(500).json({ error: 'Your subscription request could not be saved. Please try again shortly.' });
  }
}
