export default async function handler(req, res) {
  // Use environment variables or fallback to the public ones in the frontend
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
  const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';

  try {
    // Fetch published products, their inventory, and primary image
    const query = `
      select=id,title,slug,description,price,compare_at_price,sku,category,
      inventory(available),
      product_images(cdn_url)
    `.replace(/\s+/g, '');
    
    // We order product_images by sort_order inside Supabase by default or just pick the first.
    // The select syntax fetches related tables based on foreign keys.
    const url = `${SUPABASE_URL}/rest/v1/products?status=eq.published&select=id,title,slug,description,price,compare_at_price,sku,category,inventory(available),product_images(cdn_url)`;
    
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': `Bearer ${SUPABASE_ANON}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch from Supabase: ${response.status} ${response.statusText}`);
    }

    const products = await response.json();

    const baseUrl = 'https://brightkeysolutions.com';

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
  <channel>
    <title>BrightKey Products</title>
    <link>${baseUrl}/products</link>
    <description>BrightKey Product Catalog for Facebook and Google Shopping</description>
`;

    products.forEach(product => {
      const productUrl = `${baseUrl}/product.html?slug=${product.slug}`;
      const imageUrl = product.product_images && product.product_images.length > 0 
        ? product.product_images[0].cdn_url 
        : `${baseUrl}/assets/og-image.png`;
      
      const priceString = (product.price / 100).toFixed(2);
      const inventoryCount = product.inventory && product.inventory.length > 0 ? product.inventory[0].available : 0;
      const availability = inventoryCount > 0 ? 'in stock' : 'out of stock';
      
      const desc = (product.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const title = (product.title || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      xml += `    <item>
      <g:id>${product.sku || product.id}</g:id>
      <g:title>${title}</g:title>
      <g:description>${desc}</g:description>
      <g:link>${productUrl}</g:link>
      <g:image_link>${imageUrl}</g:image_link>
      <g:brand>BrightKey</g:brand>
      <g:condition>new</g:condition>
      <g:availability>${availability}</g:availability>
      <g:price>${priceString} PHP</g:price>
      <g:product_type>${(product.category || '').replace(/&/g, '&amp;')}</g:product_type>
      <g:inventory>${inventoryCount}</g:inventory>
    </item>
`;
    });

    xml += `  </channel>
</rss>`;

    res.setHeader('Content-Type', 'text/xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate'); // Cache on Vercel CDN for 1 hour
    res.status(200).send(xml);

  } catch (error) {
    console.error('Catalog Feed Error:', error);
    res.status(500).json({ error: 'Failed to generate catalog feed.' });
  }
}
