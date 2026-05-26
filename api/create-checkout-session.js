export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
  if (!PAYMONGO_SECRET_KEY) {
    return res.status(500).json({ error: 'Payment gateway not configured' });
  }

  const { billing, line_items, success_url, cancel_url, description } = req.body;

  if (!billing || !line_items?.length || !success_url || !cancel_url) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const pmRes = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
      },
      body: JSON.stringify({
        data: {
          attributes: {
            billing,
            line_items,
            payment_method_types: ['card', 'gcash', 'paymaya', 'grab_pay'],
            success_url,
            cancel_url,
            description: description || 'BrightKey Order'
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
    return res.status(500).json({ error: err.message });
  }
}
