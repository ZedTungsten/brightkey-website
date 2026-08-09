import { createHmac, timingSafeEqual } from 'crypto';
import { verifyCheckoutPayload } from '../lib/api/checkout-pricing.js';

export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
  const SUPABASE_URL   = process.env.SUPABASE_URL;
  const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // ── Signature verification ────────────────────────────────────
  const sigHeader = req.headers['paymongo-signature'];
  if (!sigHeader) return res.status(400).json({ error: 'Missing signature' });

  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
  const timestamp  = parts['t'];
  const testSig    = parts['te'];
  const liveSig    = parts['li'];
  const incomingSig = testSig || liveSig;

  const rawBodyBuffer = await readRawBody(req);
  const rawBody = rawBodyBuffer.toString('utf8');
  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const incomingBuffer = Buffer.from(String(incomingSig || ''), 'hex');
  if (expectedBuffer.length !== incomingBuffer.length || !timingSafeEqual(expectedBuffer, incomingBuffer)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ── Handle event ─────────────────────────────────────────────
  let event;
  try { event = JSON.parse(rawBody); } catch (_) { return res.status(400).json({ error: 'Invalid webhook body' }); }
  if (event?.data?.attributes?.type !== 'checkout_session.payment.paid') {
    return res.status(200).json({ received: true }); // Ignore other events
  }

  const session = event.data.attributes.data;
  const attrs   = session?.attributes || {};
  const meta    = attrs.metadata || {};

  const customerName    = meta.customer_name    || attrs.billing?.name  || 'Guest';
  const customerEmail   = meta.customer_email   || attrs.billing?.email || '';
  const customerPhone   = meta.customer_phone   || attrs.billing?.phone || '';
  const shippingCity    = meta.shipping_city    || '';
  const shippingAddress = meta.shipping_address || '';
  const shippingCents   = parseInt(meta.shipping_cents  || '0', 10);
  const totalCents      = parseInt(meta.total_cents     || '0', 10);
  const paymentIntentId = session?.id || 'webhook';

  let cartItems = [];
  try { cartItems = JSON.parse(meta.cart_items || '[]'); } catch (_) {}

  const signedPayload = {
    company_id: meta.company_id || '',
    total_cents: totalCents,
    shipping_cents: shippingCents,
    discount_cents: parseInt(meta.discount_cents || '0', 10),
    coupon_code: meta.coupon_code || '',
    cart_items: cartItems
  };
  if (!verifyCheckoutPayload(
    signedPayload,
    meta.checkout_signature,
    process.env.CHECKOUT_SIGNING_SECRET || WEBHOOK_SECRET
  )) {
    return res.status(400).json({ error: 'Checkout details could not be verified.' });
  }

  let billingAddress = null;
  if (meta.billing_info && meta.billing_info !== 'same') {
    try { billingAddress = JSON.parse(meta.billing_info); } catch (_) {}
  }

  // ── Insert order ─────────────────────────────────────────────
  try {
    const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        company_id:       signedPayload.company_id,
        customer_name:    customerName,
        customer_email:   customerEmail,
        customer_phone:   customerPhone,
        shipping_city:    shippingCity,
        shipping_address: shippingAddress,
        total_amount:     totalCents,
        shipping_fee:     shippingCents,
        payment_intent_id: paymentIntentId,
        status: 'paid',
        billing_address:  billingAddress
      })
    });

    if (!orderRes.ok) {
      const errText = await orderRes.text();
      console.error('Order insert failed:', errText);
      return res.status(500).json({ error: 'Order insert failed' });
    }

    const orderData = await orderRes.json();
    const orderId   = orderData[0]?.id;

    if (orderId && cartItems.length > 0) {
      const itemsToInsert = cartItems
        .filter(item => !item.isFreeGift)
        .map(item => ({
          order_id:           orderId,
          product_id:         item.id,
          quantity:           item.quantity,
          price_at_purchase:  item.price
        }));

      await fetch(`${SUPABASE_URL}/rest/v1/order_items`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(itemsToInsert)
      });
    }
  } catch (err) {
    console.error('Webhook DB error:', err);
    return res.status(500).json({ error: 'The paid order could not be recorded. Please retry the webhook.' });
  }

  return res.status(200).json({ received: true });
}
