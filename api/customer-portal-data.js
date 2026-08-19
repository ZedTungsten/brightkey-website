import { createServiceClient, getBearerToken, setApiCors } from '../lib/api/security.js';

const FEATURE_TABLES = {
  smart_lock: 'smartlock_features',
  solar_power: 'solarpower_features',
  cctv: 'cctv_features',
  fire_extinguisher: 'fireextinguisher_features'
};
const PRODUCT_PORTAL_FIELDS = [
  'id', 'sku', 'title', 'slug', 'image_main', 'description', 'business',
  'sale_price', 'discounted_price', 'show_specs', 'specifications',
  'spec_model', 'spec_color', 'spec_weight', 'spec_operating_temperature',
  'spec_warranty', 'spec_support', 'spec_material', 'spec_voltage', 'spec_dimension'
].join(',');
const DEFAULT_SPEC_DEFINITIONS = [
  { label: 'Model', field: 'spec_model', source: 'column' },
  { label: 'Color', field: 'spec_color', source: 'column' },
  { label: 'Weight', field: 'spec_weight', source: 'column' },
  { label: 'Operating Temperature', field: 'spec_operating_temperature', source: 'column' },
  { label: 'Warranty', field: 'spec_warranty', source: 'column' },
  { label: 'Technical Support', field: 'spec_support', source: 'column' },
  { label: 'Material', field: 'spec_material', source: 'column' },
  { label: 'Voltage', field: 'spec_voltage', source: 'column' },
  { label: 'Dimension', field: 'spec_dimension', source: 'column' }
];
const splitPipe = value => String(value || '').split('|').map(item => item.trim()).filter(Boolean);

function productItems(booking) {
  const skus = splitPipe(booking.product_skus);
  const quantities = splitPipe(booking.product_qtys);
  return skus.map((sku, index) => ({ sku, quantity: Number.parseInt(quantities[index], 10) || 1 }));
}

function productSpecifications(product, definitions = DEFAULT_SPEC_DEFINITIONS) {
  if (product.show_specs === false) return {};
  return Object.fromEntries(definitions.map(definition => {
    const value = definition.source === 'column'
      ? product[definition.field]
      : product.specifications?.[definition.field];
    return [definition.label, value];
  }).filter(([label, value]) => label && value !== null && value !== ''));
}

function publicProduct(product, features = {}, specDefinitions = DEFAULT_SPEC_DEFINITIONS) {
  return {
    id: product.id,
    sku: product.sku,
    title: product.title,
    slug: product.slug,
    image: product.image_main,
    description: product.description,
    business: product.business,
    sale_price: product.sale_price,
    discounted_price: product.discounted_price,
    specifications: productSpecifications(product, specDefinitions),
    features
  };
}

export { productItems, productSpecifications, publicProduct };

export default async function handler(req, res) {
  setApiCors(req, res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Sign in to view your customer portal.' });

  try {
    const admin = createServiceClient();
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return res.status(401).json({ error: 'Your session has expired. Sign in again.' });

    const { data: account, error: accountError } = await admin
      .from('customer_portal_accounts')
      .select('id,company_id,phone_normalized,customer_first_name,customer_last_name,affiliate_code')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle();
    if (accountError || !account) return res.status(403).json({ error: 'This login is not linked to a customer portal.' });

    const [
      { data: orderLinks, error: linkError },
      { data: catalog, error: catalogError },
      { data: specSetting, error: specSettingError }
    ] = await Promise.all([
      admin.from('customer_portal_orders')
        .select('booking_id')
        .eq('account_id', account.id)
        .order('created_at', { ascending: false })
        .limit(50),
      admin.from('products')
        .select(PRODUCT_PORTAL_FIELDS)
        .eq('company_id', account.company_id)
        .eq('show_on_ecommerce', true)
        .order('title')
        .limit(60),
      admin.from('global_settings')
        .select('value')
        .eq('company_id', account.company_id)
        .eq('key', 'catalog_spec_definitions')
        .maybeSingle()
    ]);
    if (linkError || catalogError || specSettingError) throw linkError || catalogError || specSettingError;
    const specDefinitions = Array.isArray(specSetting?.value?.definitions)
      ? specSetting.value.definitions
      : DEFAULT_SPEC_DEFINITIONS;

    const bookingIds = (orderLinks || []).map(link => link.booking_id);
    let bookings = [];
    if (bookingIds.length) {
      const { data, error } = await admin.from('installation_bookings')
        .select('id,order_no,created_at,scheduled_date,status,doors,product_skus,product_qtys')
        .eq('company_id', account.company_id)
        .in('id', bookingIds)
        .not('order_no', 'ilike', 'DO-%');
      if (error) throw error;
      const orderIndex = new Map(bookingIds.map((id, index) => [id, index]));
      bookings = (data || []).sort((left, right) => orderIndex.get(left.id) - orderIndex.get(right.id));
    }

    const purchasedSkus = [...new Set((bookings || []).flatMap(booking => productItems(booking).map(item => item.sku)))];
    let purchasedProducts = [];
    if (purchasedSkus.length) {
      const { data, error } = await admin.from('products')
        .select(PRODUCT_PORTAL_FIELDS)
        .eq('company_id', account.company_id)
        .in('sku', purchasedSkus.slice(0, 100));
      if (error) throw error;
      purchasedProducts = data || [];
    }

    const featuresByProduct = {};
    await Promise.all(Object.entries(FEATURE_TABLES).map(async ([business, table]) => {
      const ids = purchasedProducts.filter(product => product.business === business).map(product => product.id);
      if (!ids.length) return;
      // Feature columns are tenant-configurable; this bounded detail query must retain their complete shape.
      const { data, error } = await admin.from(table).select('*').in('product_id', ids);
      if (error) throw error;
      (data || []).forEach(row => {
        featuresByProduct[row.product_id] = Object.fromEntries(Object.entries(row).filter(([key, value]) =>
          !['id', 'product_id'].includes(key) && value !== null && value !== ''
        ));
      });
    }));

    const purchasedMap = Object.fromEntries(purchasedProducts.map(product => [
      product.sku,
      publicProduct(product, featuresByProduct[product.id], specDefinitions)
    ]));
    return res.status(200).json({
      customer: {
        first_name: account.customer_first_name,
        last_name: account.customer_last_name,
        affiliate_code: account.affiliate_code
      },
      purchases: (bookings || []).map(booking => ({
        id: booking.id,
        order_no: booking.order_no,
        booking_date: booking.created_at,
        installation_date: booking.scheduled_date,
        status: booking.status,
        doors: booking.doors,
        items: productItems(booking).map(item => ({ ...item, product: purchasedMap[item.sku] || null }))
      })),
      catalog: (catalog || []).map(product => publicProduct(product, {}, specDefinitions)),
      vouchers: []
    });
  } catch (error) {
    console.error('Customer portal data failed:', error);
    return res.status(503).json({ error: 'Your portal information could not be loaded. Please try again.' });
  }
}
