import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { company_id, line_items, success_url, cancel_url } = req.body;

  if (!company_id) {
    return res.status(400).json({ error: 'Missing company identifier.' });
  }
  if (!line_items?.length || !success_url || !cancel_url) {
    return res.status(400).json({ error: 'Missing line items or redirection parameters.' });
  }

  try {
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

    // Prepare url-encoded parameters for Stripe Sessions API
    const params = new URLSearchParams();
    params.append('success_url', success_url);
    params.append('cancel_url', cancel_url);
    params.append('mode', 'payment');

    line_items.forEach((item, idx) => {
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
    return res.status(500).json({ error: err.message });
  }
}
