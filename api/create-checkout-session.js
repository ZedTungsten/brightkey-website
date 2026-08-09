import { createClient } from '@supabase/supabase-js';
import { isAllowedRedirectUrl, setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';
import { buildServerCheckout, signCheckoutPayload } from '../lib/api/checkout-pricing.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  setApiCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { company_id, billing, cart_items, shipping_city, coupon_code, success_url, cancel_url, description, metadata } = req.body;

  if (!company_id) {
    return res.status(400).json({ error: 'Missing company identifier.' });
  }
  if (!billing || !cart_items?.length || !success_url || !cancel_url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!isAllowedRedirectUrl(success_url) || !isAllowedRedirectUrl(cancel_url)) {
    return res.status(400).json({ error: 'Invalid checkout return URL.' });
  }
  try {
    if (!await enforceRateLimit({
      supabase, req, res, scope: 'paymongo-checkout', identifier: company_id, limit: 60, windowSeconds: 600
    })) return;
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

    const checkout = await buildServerCheckout(supabase, {
      companyId: company_id,
      cartItems: cart_items,
      shippingCity: shipping_city,
      couponCode: coupon_code
    });
    const signedPayload = {
      company_id,
      total_cents: checkout.totalCents,
      shipping_cents: checkout.shippingCents,
      discount_cents: checkout.discountCents,
      coupon_code: checkout.couponCode,
      cart_items: checkout.cartItems
    };
    const checkoutSignature = signCheckoutPayload(signedPayload, process.env.CHECKOUT_SIGNING_SECRET || process.env.PAYMONGO_WEBHOOK_SECRET);

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
            line_items: checkout.lineItems,
            payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
            success_url,
            cancel_url,
            description: description || 'BrightKey Order',
            metadata: {
              ...(metadata || {}),
              company_id,
              total_cents: String(checkout.totalCents),
              shipping_cents: String(checkout.shippingCents),
              discount_cents: String(checkout.discountCents),
              coupon_code: checkout.couponCode,
              cart_items: JSON.stringify(checkout.cartItems),
              checkout_signature: checkoutSignature
            }
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
    return res.status(err.status || 500).json({ error: err.status ? err.message : 'Payment could not be initialized. Please try again.' });
  }
}
