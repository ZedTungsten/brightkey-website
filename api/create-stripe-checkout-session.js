import { createClient } from '@supabase/supabase-js';
import { isAllowedRedirectUrl, setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';
import { buildServerCheckout } from '../lib/api/checkout-pricing.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  setApiCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { company_id, cart_items, shipping_city, coupon_code, success_url, cancel_url } = req.body;

  if (!company_id) {
    return res.status(400).json({ error: 'Missing company identifier.' });
  }
  if (!cart_items?.length || !success_url || !cancel_url) {
    return res.status(400).json({ error: 'Missing line items or redirection parameters.' });
  }
  if (!isAllowedRedirectUrl(success_url) || !isAllowedRedirectUrl(cancel_url)) {
    return res.status(400).json({ error: 'Invalid checkout return URL.' });
  }
  try {
    if (!await enforceRateLimit({
      supabase, req, res, scope: 'stripe-checkout', identifier: company_id, limit: 60, windowSeconds: 600
    })) return;
    // Parameterized lookup for Stripe Secret Key
    const { data: config, error: configErr } = await supabase
      .from('company_integrations')
      .select('stripe_secret_key')
      .eq('company_id', company_id)
      .maybeSingle();

    if (configErr) throw configErr;
    if (!config || !config.stripe_secret_key) {
      return res.status(400).json({ error: 'Stripe integration is not configured by the store owner.' });
    }

    const checkout = await buildServerCheckout(supabase, {
      companyId: company_id,
      cartItems: cart_items,
      shippingCity: shipping_city,
      couponCode: coupon_code
    });

    // Prepare url-encoded parameters for Stripe Sessions API
    const params = new URLSearchParams();
    params.append('success_url', success_url);
    params.append('cancel_url', cancel_url);
    params.append('mode', 'payment');

    checkout.lineItems.forEach((item, idx) => {
      params.append(`line_items[${idx}][price_data][currency]`, (item.currency || 'PHP').toLowerCase());
      params.append(`line_items[${idx}][price_data][product_data][name]`, item.name);
      params.append(`line_items[${idx}][price_data][unit_amount]`, String(item.amount)); // in centavos/cents
      params.append(`line_items[${idx}][quantity]`, String(item.quantity || 1));
    });

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.stripe_secret_key}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await stripeRes.json();

    if (!stripeRes.ok) {
      const errorMsg = data?.error?.message || 'Failed to initialize Stripe checkout.';
      return res.status(stripeRes.status).json({ error: errorMsg });
    }

    return res.status(200).json({ checkout_url: data.url });
  } catch (err) {
    console.error('Stripe session creation error:', err);
    return res.status(err.status || 500).json({ error: err.status ? err.message : 'Payment could not be initialized. Please try again.' });
  }
}
