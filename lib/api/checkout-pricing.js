import { createHmac, timingSafeEqual } from 'node:crypto';

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function checkoutError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function isRuleActive(rule, now = new Date()) {
  if (!rule?.enabled) return false;
  if (rule.indefinite) return true;
  const start = rule.active_from ? new Date(rule.active_from) : null;
  const end = rule.active_to ? new Date(rule.active_to) : null;
  return (!start || start <= now) && (!end || end >= now);
}

function distributeDiscount(lines, discountCents) {
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  let remaining = Math.min(discountCents, subtotal);
  return lines.map((line, index) => {
    const share = index < lines.length - 1 && subtotal > 0
      ? Math.round((line.amount / subtotal) * discountCents)
      : remaining;
    remaining -= share;
    return { ...line, amount: Math.max(1, line.amount - share) };
  });
}

function productLookupKeys(item) {
  const rawId = String(item?.id || '');
  const uuid = rawId.match(UUID_PREFIX)?.[0] || null;
  const suffix = uuid ? rawId.slice(uuid.length + 1) : null;
  return {
    uuid,
    sku: suffix && !['undefined', 'null'].includes(suffix.toLowerCase()) ? suffix : String(item?.sku || '')
  };
}

export async function buildServerCheckout(supabase, {
  companyId,
  cartItems,
  shippingCity,
  couponCode
}) {
  if (!companyId || !Array.isArray(cartItems) || cartItems.length === 0 || cartItems.length > 50) {
    throw checkoutError('Your cart could not be validated. Refresh the page and try again.');
  }

  const requested = cartItems.filter(item => !item?.isFreeGift).map(item => {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.price);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100 || !Number.isInteger(unitPrice) || unitPrice < 1) {
      throw checkoutError('One or more cart items are invalid.');
    }
    return { item, quantity, unitPrice, ...productLookupKeys(item) };
  });
  if (!requested.length) throw checkoutError('Your cart does not contain a payable product.');

  const ids = [...new Set(requested.map(item => item.uuid).filter(Boolean))];
  const skus = [...new Set(requested.map(item => item.sku).filter(Boolean))];
  const productFields = 'id,sku,title,business,category,sale_price,before_price,company_id';
  const productQueries = [];
  if (ids.length) productQueries.push(supabase.from('products').select(productFields).eq('company_id', companyId).in('id', ids));
  if (skus.length) productQueries.push(supabase.from('products').select(productFields).eq('company_id', companyId).in('sku', skus));
  const productResults = await Promise.all(productQueries);
  const productRows = [];
  for (const result of productResults) {
    if (result.error) throw result.error;
    productRows.push(...(result.data || []));
  }
  const byId = new Map(productRows.map(product => [String(product.id).toLowerCase(), product]));
  const bySku = new Map(productRows.map(product => [String(product.sku).toLowerCase(), product]));

  const { data: upsellSetting, error: upsellError } = await supabase
    .from('global_settings')
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'upsell_cross_sell')
    .maybeSingle();
  if (upsellError) throw upsellError;
  const activeUpsells = (upsellSetting?.value?.upsell_rules || []).filter(rule => isRuleActive(rule));

  const canonicalItems = requested.map(request => {
    const product = bySku.get(String(request.sku || '').toLowerCase()) || byId.get(String(request.uuid || '').toLowerCase());
    if (!product) throw checkoutError('A product in your cart is no longer available. Refresh the cart and try again.');
    const basePrice = Number(product.sale_price || product.before_price);
    const allowedPrices = new Set([basePrice]);
    activeUpsells
      .filter(rule => String(rule.upsell_sku || '').toLowerCase() === String(product.sku || '').toLowerCase())
      .forEach(rule => allowedPrices.add(basePrice + Number(rule.price_adjustment || 0)));
    if (!allowedPrices.has(request.unitPrice)) {
      throw checkoutError('A product price has changed. Refresh the cart before paying.');
    }
    return {
      id: product.id,
      sku: product.sku,
      title: product.title,
      business: product.business,
      category: product.category,
      quantity: request.quantity,
      price: request.unitPrice
    };
  });

  const subtotalCents = canonicalItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let discountCents = 0;
  let appliedCouponCode = '';
  if (couponCode) {
    const { data: coupon, error: couponError } = await supabase
      .from('coupons')
      .select('code,discount_type,discount_value,start_date,end_date')
      .eq('company_id', companyId)
      .eq('code', String(couponCode).trim().toUpperCase())
      .maybeSingle();
    if (couponError) throw couponError;
    const now = new Date();
    if (!coupon || (coupon.start_date && new Date(coupon.start_date) > now) || (coupon.end_date && new Date(coupon.end_date) < now)) {
      throw checkoutError('The discount code is no longer valid.');
    }
    discountCents = coupon.discount_type === 'percentage'
      ? Math.round(subtotalCents * (Number(coupon.discount_value) / 100))
      : Math.round(Number(coupon.discount_value) * 100);
    discountCents = Math.min(Math.max(discountCents, 0), subtotalCents);
    appliedCouponCode = coupon.code;
  }

  let shippingCents = 0;
  if (shippingCity) {
    const { data: area, error: areaError } = await supabase
      .from('shipping_areas')
      .select('zone_id')
      .eq('company_id', companyId)
      .eq('name', shippingCity)
      .maybeSingle();
    if (areaError) throw areaError;
    if (!area) throw checkoutError('Shipping is not available for the selected city.');
    const { data: zone, error: zoneError } = await supabase
      .from('shipping_zones')
      .select('fee')
      .eq('company_id', companyId)
      .eq('id', area.zone_id)
      .eq('is_active', true)
      .maybeSingle();
    if (zoneError) throw zoneError;
    if (!zone) throw checkoutError('Shipping is not available for the selected city.');
    shippingCents = Number(zone.fee || 0);

    const { data: freeShipping, error: freeShippingError } = await supabase
      .from('global_settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'free_shipping')
      .maybeSingle();
    if (freeShippingError) throw freeShippingError;
    const config = freeShipping?.value || {};
    const businesses = [...new Set(canonicalItems.map(item => item.business).filter(Boolean))];
    let freeShippingThreshold = null;
    for (const business of businesses) {
      const rule = (config.businesses || []).find(item => item.name === business && item.enabled && item.threshold > 0);
      if (rule) { freeShippingThreshold = rule.threshold; break; }
    }
    if (freeShippingThreshold === null && config.storewide_enabled && config.threshold > 0) freeShippingThreshold = config.threshold;
    if (freeShippingThreshold !== null && subtotalCents >= freeShippingThreshold) shippingCents = 0;
  }

  let paymentLines = canonicalItems.map(item => ({
    name: item.quantity > 1 ? `${item.title} × ${item.quantity}` : item.title,
    amount: item.price * item.quantity,
    quantity: 1,
    currency: 'PHP'
  }));
  if (discountCents > 0) paymentLines = distributeDiscount(paymentLines, discountCents);
  if (shippingCents > 0) paymentLines.push({ name: 'Shipping', amount: shippingCents, quantity: 1, currency: 'PHP' });

  return {
    lineItems: paymentLines,
    cartItems: canonicalItems,
    subtotalCents,
    shippingCents,
    discountCents,
    totalCents: subtotalCents + shippingCents - discountCents,
    couponCode: appliedCouponCode
  };
}

export function signCheckoutPayload(payload, secret) {
  if (!secret) throw new Error('Checkout signing is not configured.');
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

export function verifyCheckoutPayload(payload, signature, secret) {
  if (!signature || !secret) return false;
  const expected = Buffer.from(signCheckoutPayload(payload, secret), 'hex');
  const received = Buffer.from(String(signature), 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
