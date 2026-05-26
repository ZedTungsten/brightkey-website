import { createHmac } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;
  const SUPABASE_URL   = process.env.SUPABASE_URL;
  const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

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

  const rawBody = JSON.stringify(req.body);
  const expected = createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  if (expected !== incomingSig) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ── Handle event ─────────────────────────────────────────────
  const event = req.body;
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
        customer_name:    customerName,
        customer_email:   customerEmail,
        customer_phone:   customerPhone,
        shipping_city:    shippingCity,
        shipping_address: shippingAddress,
        total_amount:     totalCents,
        shipping_fee:     shippingCents,
        payment_intent_id: paymentIntentId,
        status: 'paid'
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
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
}
