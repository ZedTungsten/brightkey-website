import { createServiceClient, setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^[+0-9()\-\s]{7,24}$/;

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
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

    return res.status(201).json({
      success: true,
      signup_mode: freeSignup ? 'free' : 'payment_required',
      tenant_registered: Boolean(registration?.tenant_id)
    });
  } catch (error) {
    console.error('Subscription request failed:', error);
    return res.status(500).json({ error: 'Your subscription request could not be saved. Please try again shortly.' });
  }
}
