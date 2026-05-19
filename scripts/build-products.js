import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY must be provided in environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function formatPHP(centavos) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);
}

async function buildProducts() {
  console.log('Fetching products from Supabase for SSG...');
  
  const { data: products, error } = await supabase
    .from('products')
    .select('*, inventory(available, ordered_past_month), product_images(*)')
    .eq('status', 'published');

  if (error) {
    console.error('Failed to fetch products:', error);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log('No published products found.');
    return;
  }

  // Ensure products directory exists
  const outDir = path.resolve('./products');
  await fs.mkdir(outDir, { recursive: true });

  // Read template
  const templatePath = path.resolve('./product-template.html');
  const templateHtml = await fs.readFile(templatePath, 'utf8');

  for (const p of products) {
    console.log(`Building static page for: ${p.slug}`);

    // Inventory calculations
    let available = 0;
    let ordered = 0;
    if (p.inventory && p.inventory.length > 0) {
      available = p.inventory[0].available;
      ordered = p.inventory[0].ordered_past_month;
    }

    let statusText = 'Out of Stock';
    let statusColor = 'badge-muted';
    let inventoryText = 'Currently out of stock. Please contact us for restock dates.';
    let btnDisabled = 'disabled="true"';
    let btnText = 'Out of Stock';

    if (available > 0) {
      statusText = 'In Stock';
      statusColor = 'badge-cyan';
      inventoryText = `<strong style="color:var(--text-primary);">${available} available</strong> in our local warehouse.`;
      if (ordered > 0) {
        inventoryText += ` <span style="color:#f59e0b;">🔥 ${ordered} ordered in the last 30 days.</span>`;
      }
      btnDisabled = '';
      btnText = 'Add to Cart';
    }

    // Images
    let mainImgUrl = '../assets/og-image.png';
    let thumbnailsHtml = '';
    
    if (p.product_images && p.product_images.length > 0) {
      p.product_images.sort((a,b) => a.sort_order - b.sort_order);
      mainImgUrl = p.product_images[0].cdn_url;
      
      if (p.product_images.length > 1) {
        thumbnailsHtml = p.product_images.map(img => `
          <button style="border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-surface); padding: 0.25rem; cursor:pointer; width:64px; height:64px; flex-shrink:0;" onclick="window.switchImage('${img.cdn_url}')">
            <img src="${img.cdn_url}" style="width:100%; height:100%; object-fit:contain;" alt="${img.alt_text || ''}"/>
          </button>
        `).join('');
      }
    }

    // Price formatting
    const priceStr = formatPHP(p.price);
    const comparePriceStr = p.compare_at_price ? formatPHP(p.compare_at_price) : '';
    const comparePriceDisplay = (p.compare_at_price && p.compare_at_price > p.price) ? 'display:inline;' : 'display:none;';

    // JSON-LD Generation
    const jsonLd = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": p.title,
      "image": [mainImgUrl],
      "description": p.description || "",
      "sku": p.sku || p.id,
      "brand": {
        "@type": "Brand",
        "name": "BrightKey"
      },
      "offers": {
        "@type": "Offer",
        "url": `https://brightkeysolutions.com/products/${p.slug}`,
        "priceCurrency": "PHP",
        "price": (p.price / 100).toFixed(2),
        "availability": available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        "itemCondition": "https://schema.org/NewCondition"
      }
    };

    const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;

    // Build the page
    let pageHtml = templateHtml
      .replace(/{{META_TITLE}}/g, `${p.title} — BrightKey`)
      .replace(/{{META_DESC}}/g, p.description ? p.description.substring(0, 160) : '')
      .replace(/{{OG_URL}}/g, `https://brightkeysolutions.com/products/${p.slug}`)
      .replace(/{{OG_IMAGE}}/g, mainImgUrl)
      .replace(/{{JSON_LD}}/g, jsonLdScript)
      
      .replace(/{{BREADCRUMB_TITLE}}/g, p.title)
      .replace(/{{TITLE}}/g, p.title)
      .replace(/{{MAIN_IMAGE}}/g, mainImgUrl)
      .replace(/{{THUMBNAILS_HTML}}/g, thumbnailsHtml)
      .replace(/{{CATEGORY}}/g, p.category)
      .replace(/{{STATUS_COLOR}}/g, statusColor)
      .replace(/{{STATUS_TEXT}}/g, statusText)
      .replace(/{{SKU_TEXT}}/g, p.sku ? `SKU: ${p.sku}` : '')
      .replace(/{{PRICE}}/g, priceStr)
      .replace(/{{COMPARE_PRICE_DISPLAY}}/g, comparePriceDisplay)
      .replace(/{{COMPARE_PRICE}}/g, comparePriceStr)
      .replace(/{{DESCRIPTION}}/g, p.description || '')
      .replace(/{{INVENTORY_TEXT}}/g, inventoryText)
      .replace(/{{BTN_DISABLED}}/g, btnDisabled)
      .replace(/{{BTN_TEXT}}/g, btnText)
      
      .replace(/{{PRODUCT_ID}}/g, p.id)
      .replace(/{{SLUG}}/g, p.slug)
      .replace(/{{RAW_PRICE}}/g, p.price)
      .replace(/{{SUPABASE_URL}}/g, SUPABASE_URL)
      .replace(/{{SUPABASE_ANON}}/g, SUPABASE_ANON_KEY);

    const outFilePath = path.join(outDir, `${p.slug}.html`);
    await fs.writeFile(outFilePath, pageHtml, 'utf8');
  }

  console.log(`Successfully built ${products.length} static product pages.`);
}

buildProducts();
