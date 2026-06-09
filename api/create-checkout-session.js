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

  const { company_id, billing, line_items, success_url, cancel_url, description, metadata } = req.body;

  if (!company_id) {
    return res.status(400).json({ error: 'Missing company identifier.' });
  }
  if (!billing || !line_items?.length || !success_url || !cancel_url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Parameterized lookup for Paymongo Secret Key
    const { data: config, error: configErr } = await supabase
      .from('company_integrations')
      .select('paymongo_secret_key')
      .eq('company_id', company_id)
      .maybeSingle();

    if (configErr) throw configErr;
    if (!config || !config.paymongo_secret_key) {
      return res.status(400).json({ error: 'Paymongo integration is not configured by the store owner.' });
    }

    const pmRes = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(config.paymongo_secret_key + ':').toString('base64')}`
      },
      body: JSON.stringify({
        data: {
          attributes: {
            billing,
            line_items,
            payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
            success_url,
            cancel_url,
            description: description || 'BrightKey Order',
            ...(metadata && { metadata })
          }
        }
      })
    });

    const data = await pmRes.json();

    if (!pmRes.ok) {
      const detail = data?.errors?.[0]?.detail || 'Failed to create checkout session';
      return res.status(pmRes.status).json({ error: detail });
    }

    return res.status(200).json({ checkout_url: data.data.attributes.checkout_url });
  } catch (err) {
    console.error('Paymongo session creation error:', err);
    return res.status(500).json({ error: err.message });
  }
}
