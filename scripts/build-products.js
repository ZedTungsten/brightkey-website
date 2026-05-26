import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as cheerio from 'cheerio';

dotenv.config();

const SUPABASE_URL     = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANON;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Warning: SUPABASE_URL / SUPABASE_ANON_KEY not set — skipping products SSG.');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPHP(centavos) {
  if (!centavos) return '<span style="display:inline-flex; align-items:flex-start; line-height:0.9;"><span>₱0</span><span style="font-size:0.6em; font-weight:500; margin-top:0.05em; margin-left:1px;">00</span></span>';
  const formatted = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(centavos / 100);
  return formatted.replace(/(.+)\.(\d{2})$/, '<span style="display:inline-flex; align-items:flex-start; line-height:0.9;"><span>$1</span><span style="font-size:0.6em; font-weight:500; margin-top:0.05em; margin-left:1px;">$2</span></span>');
}

/** Display price: use discounted_price if > 0, else sale_price */
function displayPrice(p) {
  return (p.discounted_price > 0) ? p.discounted_price : (p.sale_price || 0);
}

/** Get HTML for promotional badges/tags */
function getPromoTagsHtml(tags) {
  if (!tags || !Array.isArray(tags) || tags.length === 0) return '';
  
  const map = {
    'best-seller': `
      <span class="badge badge-best-seller">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:middle;margin-top:-2px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        Best Seller
      </span>
    `,
    'hot': `
      <span class="badge badge-hot">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:middle;margin-top:-2px;"><path d="M12 2c0 0-4.5 4.5-4.5 8.5C7.5 14.64 10.86 18 15 18c4.14 0 7.5-3.36 7.5-7.5C22.5 6.5 18 2 18 2zm0 14c-2.21 0-4-1.79-4-4 0-1.66 1.34-3 3-3s3 1.34 3 3c0 2.21-1.79 4-4 4z"/></svg>
        Hot
      </span>
    `,
    'limited-time': `
      <span class="badge badge-limited">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-top:-2px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Limited Time
      </span>
    `,
    'new': `
      <span class="badge badge-new-promo">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-top:-2px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        New
      </span>
    `
  };

  return tags.map(t => map[t] || '').filter(Boolean).join('');
}

/** Get HTML for promotional badges/tags inside cards (smaller size) */
function getPromoTagsHtmlForCard(tags) {
  if (!tags || !Array.isArray(tags) || tags.length === 0) return '';
  
  const map = {
    'best-seller': `
      <span class="badge badge-best-seller" style="font-size: 0.55rem; padding: 0.15rem 0.4rem; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:middle;margin-top:-1.5px;margin-right:1px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        Best Seller
      </span>
    `,
    'hot': `
      <span class="badge badge-hot" style="font-size: 0.55rem; padding: 0.15rem 0.4rem; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:middle;margin-top:-1.5px;margin-right:1px;"><path d="M12 2c0 0-4.5 4.5-4.5 8.5C7.5 14.64 10.86 18 15 18c4.14 0 7.5-3.36 7.5-7.5C22.5 6.5 18 2 18 2zm0 14c-2.21 0-4-1.79-4-4 0-1.66 1.34-3 3-3s3 1.34 3 3c0 2.21-1.79 4-4 4z"/></svg>
        Hot
      </span>
    `,
    'limited-time': `
      <span class="badge badge-limited" style="font-size: 0.55rem; padding: 0.15rem 0.4rem; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-top:-1.5px;margin-right:1px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Limited
      </span>
    `,
    'new': `
      <span class="badge badge-new-promo" style="font-size: 0.55rem; padding: 0.15rem 0.4rem; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-top:-1.5px;margin-right:1px;"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        New
      </span>
    `
  };

  return tags.map(t => map[t] || '').filter(Boolean).join('');
}

/** Pretty-print a feature column name: "pin_unlock" → "PIN Unlock" */
function featureLabel(col) {
  let s = col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  return s
    .replace(/\bPin\b/g, 'PIN')
    .replace(/\bRfid\b/g, 'RFID')
    .replace(/\bUsb\b/g, 'USB')
    .replace(/\b3d\b/gi, '3D')
    .replace(/\bWifi\b/g, 'WiFi')
    .replace(/\bPoe\b/g, 'PoE')
    .replace(/\bCo2\b/gi, 'CO₂')
    .replace(/\bAbc\b/g, 'ABC')
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bMppt\b/g, 'MPPT');
}

/** Render features rows from a flat features object (column → value) */
function renderFeaturesHtml(featuresRow) {
  if (!featuresRow) return '';
  // Strip meta columns
  const skip = new Set(['id', 'product_id']);
  let html = '';
  for (const [col, val] of Object.entries(featuresRow)) {
    if (skip.has(col)) continue;
    if (!val || String(val).trim() === '') continue;
    const valStr = String(val).trim();
    const label  = featureLabel(col);
    // If value is 'x' (case-insensitive), just show label. Otherwise show "Label (value)"
    const display = (valStr.toLowerCase() === 'x') ? label : `${label} (${valStr})`;
    html += `
      <li style="display:flex; align-items:center; gap:0.5rem; font-size:0.95rem; color:var(--text-secondary);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
        ${display}
      </li>
    `;
  }
  return html;
}

// ── A+ Content Renderer ───────────────────────────────────────────────────────
function renderAPlusContent(blocks) {
  if (!blocks || !Array.isArray(blocks) || blocks.length === 0) return '';
  let html = '';

  const getMediaHtml = (url) => {
    if (!url) return '';
    if (url.match(/\.(mp4|webm|ogg)$/i) || url.includes('video')) {
      return `<video src="${url}" autoplay loop muted playsinline style="width:100%; height:100%; object-fit:cover; display:block;"></video>`;
    }
    return `<img src="${url}" style="width:100%; height:100%; object-fit:cover; display:block;" alt="A+ Media" />`;
  };

  blocks.forEach((b, idx) => {
    const isOdd = idx % 2 !== 0;
    const bg = isOdd ? 'var(--bg-surface)' : 'var(--bg-base)';
    
    if (b.type === 'text_image' || b.type === 'image_text') {
      const textBlock = `
        <div style="flex:1; padding:3rem; display:flex; flex-direction:column; justify-content:center;">
          ${b.header ? `<h2 style="font-size:2rem; margin-bottom:1.5rem; color:var(--text-primary);">${b.header}</h2>` : ''}
          ${b.body ? `<p style="font-size:1.1rem; line-height:1.8; color:var(--text-secondary); white-space:pre-wrap;">${b.body}</p>` : ''}
        </div>
      `;
      const mediaBlock = `
        <div style="flex:1; min-height:400px;">
          ${getMediaHtml(b.mediaUrl)}
        </div>
      `;
      html += `
        <div style="background:${bg}; display:flex; flex-wrap:wrap;">
          ${b.type === 'image_text' ? mediaBlock + textBlock : textBlock + mediaBlock}
        </div>
      `;
    } else if (b.type === 'text_center') {
      html += `
        <div style="background:${bg}; padding:4rem 2rem; text-align:center;">
          <div style="max-width:800px; margin:0 auto;">
            ${b.header ? `<h2 style="font-size:2.5rem; margin-bottom:1.5rem; color:var(--text-primary);">${b.header}</h2>` : ''}
            ${b.body ? `<p style="font-size:1.1rem; line-height:1.8; color:var(--text-secondary); white-space:pre-wrap;">${b.body}</p>` : ''}
          </div>
        </div>
      `;
    } else if (b.type === 'image_full') {
      html += `
        <div style="width:100%;">
          ${getMediaHtml(b.mediaUrl)}
        </div>
      `;
    } else if (b.type === 'grid_2x2') {
      html += `
        <div style="background:${bg}; padding:3rem 2rem;">
          <div style="max-width:1200px; margin:0 auto; display:grid; grid-template-columns:repeat(auto-fit, minmax(300px, 1fr)); gap:1.5rem;">
            ${b.img1 ? `<div style="aspect-ratio:1/1; border-radius:var(--radius-md); overflow:hidden;">${getMediaHtml(b.img1)}</div>` : ''}
            ${b.img2 ? `<div style="aspect-ratio:1/1; border-radius:var(--radius-md); overflow:hidden;">${getMediaHtml(b.img2)}</div>` : ''}
            ${b.img3 ? `<div style="aspect-ratio:1/1; border-radius:var(--radius-md); overflow:hidden;">${getMediaHtml(b.img3)}</div>` : ''}
            ${b.img4 ? `<div style="aspect-ratio:1/1; border-radius:var(--radius-md); overflow:hidden;">${getMediaHtml(b.img4)}</div>` : ''}
          </div>
        </div>
      `;
    } else if (b.type === 'carousel') {
      const items = b.items || [];
      const slides = items.map(it => `
        <div style="min-width:300px; max-width:400px; scroll-snap-align:start; background:var(--bg-base); border:1px solid var(--border); border-radius:var(--radius-md); overflow:hidden; flex-shrink:0;">
          <div style="aspect-ratio:4/3; width:100%; border-bottom:1px solid var(--border);">${getMediaHtml(it.mediaUrl)}</div>
          <div style="padding:1.5rem;">
            ${it.title ? `<h4 style="font-size:1.25rem; margin-bottom:0.5rem; color:var(--text-primary);">${it.title}</h4>` : ''}
            ${it.desc ? `<p style="font-size:0.95rem; color:var(--text-secondary); line-height:1.6;">${it.desc}</p>` : ''}
          </div>
        </div>
      `).join('');
      
      html += `
        <div style="background:${bg}; padding:4rem 2rem; overflow:hidden;">
          <div style="max-width:1200px; margin:0 auto;">
            ${b.header ? `<h2 style="font-size:2.5rem; margin-bottom:0.5rem; text-align:center; color:var(--text-primary);">${b.header}</h2>` : ''}
            ${b.subheader ? `<p style="font-size:1.1rem; color:var(--text-secondary); text-align:center; margin-bottom:3rem;">${b.subheader}</p>` : ''}
            <div style="display:flex; gap:1.5rem; overflow-x:auto; scroll-snap-type:x mandatory; padding-bottom:1.5rem; scrollbar-width:thin;">
              ${slides}
            </div>
          </div>
        </div>
      `;
    }
  });

  return html;
}

// ── Feature table map ─────────────────────────────────────────────────────────
const FEATURE_TABLE = {
  smart_lock:         'smartlock_features',
  solar_power:        'solarpower_features',
  cctv:               'cctv_features',
  fire_extinguisher:  'fireextinguisher_features',
};

// ── Main Build ────────────────────────────────────────────────────────────────
async function buildProducts() {
  console.log('Fetching products from Supabase...');

  // 1. Fetch all published products
  const { data: products, error } = await supabase
    .from('products')
    .select('*')
    .eq('status', 'published');

  if (error) {
    console.warn('Warning: Failed to fetch products:', error.message, '— skipping SSG.');
    return;
  }

  if (!products || products.length === 0) {
    console.log('No published products found. Nothing to build.');
    return;
  }

  // 2. Fetch inventory by SKU (single query)
  const skus = products.map(p => p.sku).filter(Boolean);
  const { data: inventoryRows } = await supabase
    .from('inventory')
    .select('sku, available, ordered_past_month')
    .in('sku', skus);
  const inventoryMap = {};
  (inventoryRows || []).forEach(row => { inventoryMap[row.sku] = row; });

  // 3. Fetch features for each business type (batch per type)
  const productIds = products.map(p => p.id);
  const featuresMap = {}; // product_id → features row

  for (const [biz, table] of Object.entries(FEATURE_TABLE)) {
    const bizIds = products.filter(p => p.business === biz).map(p => p.id);
    if (bizIds.length === 0) continue;
    const { data: rows } = await supabase.from(table).select('*').in('product_id', bizIds);
    (rows || []).forEach(row => { featuresMap[row.product_id] = row; });
  }

  // 4. Fetch approved reviews (all at once)
  const { data: allReviews } = await supabase
    .from('product_reviews')
    .select('*')
    .eq('is_approved', true)
    .in('product_id', productIds);
  const reviewsByProduct = {};
  (allReviews || []).forEach(r => {
    if (!reviewsByProduct[r.product_id]) reviewsByProduct[r.product_id] = [];
    reviewsByProduct[r.product_id].push(r);
  });

  // 5. Ensure products output directory exists
  const outDir = path.resolve('./products');
  await fs.mkdir(outDir, { recursive: true });

  // 6. Load SSG template
  const templateHtml = await fs.readFile(path.resolve('./product-preview.html'), 'utf8');

  const baseProducts  = products.filter(p => !p.parent_sku);
  const childProducts = products.filter(p =>  p.parent_sku);

  for (const p of baseProducts) {
    console.log(`Building: ${p.slug}`);
    const $ = cheerio.load(templateHtml);

    // Inventory
    const inv = inventoryMap[p.sku] || { available: 0, ordered_past_month: 0 };

    // Images: main image + thumbnails from fixed columns
    const mainImgUrl = p.image_main || '../assets/og-image.png';
    const supportImages = [p.image_1, p.image_2, p.image_3, p.image_4].filter(Boolean);
    const videos = [p.video_1, p.video_2].filter(Boolean);
    const allImages = [p.image_main, ...supportImages].filter(Boolean);
    
    // Total media items: images + videos
    const hasMultipleMedia = (allImages.length + videos.length) > 1;

    let thumbnailsHtml = '';
    if (hasMultipleMedia) {
      // Image thumbnails
      thumbnailsHtml += allImages.map(url => `
        <button style="border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-surface);padding:0;overflow:hidden;cursor:pointer;width:64px;height:64px;flex-shrink:0;" onclick="window.switchMedia('${url}')">
          <img src="${url}" style="width:100%;height:100%;object-fit:cover;" />
        </button>
      `).join('');

      // Video thumbnails (Play button overlay)
      thumbnailsHtml += videos.map(url => `
        <button style="border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-elevated);padding:0.25rem;cursor:pointer;width:64px;height:64px;flex-shrink:0;position:relative;display:flex;align-items:center;justify-content:center;" onclick="window.switchMedia('${url}')">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="2" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
      `).join('');
    }

    // Price
    const mainPrice   = displayPrice(p);
    const priceStr    = formatPHP(mainPrice);
    const beforeStr   = (p.before_price > 0) ? formatPHP(p.before_price) : null;
    const descStr     = p.description || '';
    const descShort   = descStr.substring(0, 160);

    // Fix relative paths for products/ subfolder
    $('link[href^="css/"]').attr('href', (i, v) => '../' + v);
    $('link[href^="assets/"]').attr('href', (i, v) => '../' + v);
    $('script[src^="js/"]').attr('src', (i, v) => '../' + v);
    $('a[href="index.html"]').attr('href', '../index.html');
    $('a[href="about.html"]').attr('href', '../about.html');
    $('a[href="products.html"]').attr('href', '../products.html');
    $('a[href="contact.html"]').attr('href', '../contact.html');
    $('a[href="cart.html"]').attr('href', '../cart.html');
    $('a[href="privacy-policy.html"]').attr('href', '../privacy-policy.html');
    $('a[href="terms-of-use.html"]').attr('href', '../terms-of-use.html');
    $('img[src^="assets/"]').not('[data-template="main-image"]').attr('src', (i, v) => '../' + v);

    // Meta tags
    $('[data-template="meta-desc"]').attr('content', descShort);
    $('[data-template="meta-title"]').text(`${p.title} — BrightKey`);
    $('[data-template="og-url"]').attr('content', `https://brightkeysolutions.com/products/${p.slug}`);
    $('[data-template="og-title"]').attr('content', `${p.title} — BrightKey`);
    $('[data-template="og-desc"]').attr('content', descShort);
    $('[data-template="og-image"]').attr('content', mainImgUrl);

    // Reviews
    const reviews  = reviewsByProduct[p.id] || [];
    const rootRevs = reviews.filter(r => !r.parent_id);
    const replies  = reviews.filter(r =>  r.parent_id);

    let avgRating = 0;
    let ratedCount = 0;
    if (rootRevs.length > 0) {
      const total = rootRevs.reduce((sum, r) => { if (r.rating) { ratedCount++; return sum + r.rating; } return sum; }, 0);
      avgRating = ratedCount > 0 ? (total / ratedCount).toFixed(1) : '0.0';
    }
    $('#avg-rating-display').text(avgRating || '0.0');
    $('#total-reviews-display').text(rootRevs.length);

    let reviewsHtml = '';
    if (rootRevs.length > 0) {
      rootRevs.forEach(r => {
        let stars = '';
        for (let i = 0; i < 5; i++) {
          stars += i < r.rating ? '<span style="color:#f59e0b;">★</span>' : '<span style="color:var(--border);">★</span>';
        }
        const date = new Date(r.created_at).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
        const initials = r.reviewer_name ? r.reviewer_name.substring(0,2).toUpperCase() : 'C';
        const revReplies = replies.filter(rep => rep.parent_id === r.id);
        const repliesHtml = revReplies.map(rep => `
          <div style="background:var(--bg-base);border-left:3px solid var(--cyan);padding:1rem;border-radius:0 var(--radius-sm) var(--radius-sm) 0;margin-top:1rem;">
            <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary);margin-bottom:0.25rem;">Response from ${rep.reviewer_name || 'BrightKey'}:</div>
            <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.5;">${rep.body || ''}</p>
          </div>
        `).join('');
        reviewsHtml += `
          <div class="review-card" style="border-bottom:1px solid var(--border);padding-bottom:1.5rem;">
            <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.5rem;">
              <div style="width:32px;height:32px;background:var(--border);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;color:var(--text-secondary);font-size:0.8rem;">${initials}</div>
              <div style="font-weight:600;color:var(--text-primary);">${r.reviewer_name || 'Customer'}</div>
              <span class="badge badge-cyan" style="font-size:0.7rem;padding:0.1rem 0.4rem;">Verified</span>
            </div>
            <div style="font-size:1.1rem;letter-spacing:1px;margin-bottom:0.5rem;">${stars}</div>
            <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:1rem;">Reviewed on ${date}</div>
            <p style="font-size:0.95rem;color:var(--text-secondary);line-height:1.6;margin-bottom:1rem;">${r.body || ''}</p>
            ${repliesHtml}
          </div>
        `;
      });
    } else {
      reviewsHtml = '<p style="color:var(--text-secondary);">No reviews yet. Be the first to review this product!</p>';
    }
    $('#reviews-container').html(reviewsHtml);

    // JSON-LD
    const jsonLd = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": p.title,
      "image": [mainImgUrl],
      "description": descStr,
      "sku": p.sku || p.id,
      "brand": { "@type": "Brand", "name": "BrightKey" },
      "offers": {
        "@type": "Offer",
        "url": `https://brightkeysolutions.com/products/${p.slug}`,
        "priceCurrency": "PHP",
        "price": (mainPrice / 100).toFixed(2),
        "availability": inv.available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        "itemCondition": "https://schema.org/NewCondition"
      }
    };
    if (rootRevs.length > 0) {
      jsonLd.aggregateRating = { "@type": "AggregateRating", "ratingValue": avgRating, "reviewCount": rootRevs.length };
    }
    $('[data-template="json-ld"]').replaceWith(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);

    // Core content
    $('[data-template="breadcrumb-title"]').text(p.title);
    $('[data-template="main-image"]').attr('src', mainImgUrl);
    $('[data-template="thumbnails-container"]').html(thumbnailsHtml);
    $('[data-template="category"]').text(p.category || '');
    $('[data-template="sku"]').text(p.sku ? `SKU: ${p.sku}` : '');
    $('[data-template="title"]').text(p.title);
    $('[data-template="price"]').html(priceStr);
    $('[data-template="description"]').text(descStr);

    // Social Proof Bar
    if (p.display_rating && p.display_reviews_count) {
      const rating = parseFloat(p.display_rating);
      const pct = Math.min(100, Math.max(0, (rating / 5) * 100));
      const spHtml = `
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom: 0.25rem;">
          <span style="font-weight:600; color:var(--text-primary); font-size:1.1rem;">${rating.toFixed(1)}</span>
          <div style="position:relative; display:inline-block; font-size:1.25rem; line-height:1; letter-spacing:1px; white-space:nowrap; margin-left:2px;">
            <span style="color:var(--border);">★★★★★</span>
            <span style="color:#f59e0b; position:absolute; left:0; top:0; overflow:hidden; width:${pct}%; white-space:nowrap;">★★★★★</span>
          </div>
          <a href="#reviews" style="color:var(--cyan); text-decoration:none; margin-left:0.25rem; font-size:0.95rem;">(${parseInt(p.display_reviews_count, 10).toLocaleString()})</a>
        </div>
        ${p.display_bought_month ? `<div style="font-size:0.95rem; color:var(--text-secondary); margin-bottom: 0.25rem;">${p.display_bought_month} bought last month</div>` : ''}
      `;
      $('[data-template="social-proof-bar"]').html(spHtml).css('display', 'block');
      
      // Also inject into the Customer Reviews section at the bottom (build-time)
      $('#avg-rating-display').text(rating.toFixed(1));
      $('#total-reviews-display').text(parseInt(p.display_reviews_count, 10).toLocaleString());
      $('#summary-stars-display').html(`
        <div style="position:relative; display:inline-block; line-height:1; white-space:nowrap;">
          <span style="color:var(--border);">★★★★★</span>
          <span style="color:#f59e0b; position:absolute; left:0; top:0; overflow:hidden; width:${pct}%; white-space:nowrap;">★★★★★</span>
        </div>
      `);
    }

    // Before price (strikethrough)
    if (beforeStr) {
      $('[data-template="compare-price"]').html(beforeStr).css('display', 'inline-block');
    } else {
      $('[data-template="compare-price"]').css('display', 'none');
    }

    // Promo badge
    if (p.discounted_price > 0) {
      $('[data-template="promo-badge"]').css('display', 'inline-block');
    } else {
      $('[data-template="promo-badge"]').css('display', 'none');
    }

    // Promo tags/badges (above price)
    const promoTagsHtml = getPromoTagsHtml(p.promo_tags);
    if (promoTagsHtml) {
      $('[data-template="promo-tags"]').html(promoTagsHtml).css('display', 'flex');
    } else {
      $('[data-template="promo-tags"]').css('display', 'none');
    }

    // Specs
    const specs = [
      { label: 'Warranty',           val: p.spec_warranty  },
      { label: 'Technical Support',  val: p.spec_support   },
      { label: 'Material',           val: p.spec_material  },
      { label: 'Voltage',            val: p.spec_voltage   },
      { label: 'Dimension',          val: p.spec_dimension },
    ].filter(s => s.val);

    if (specs.length > 0) {
      const specsHtml = specs.map(s => `
        <tr>
          <td style="padding:0.5rem 1rem 0.5rem 0;font-weight:600;color:var(--text-primary);white-space:nowrap;">${s.label}</td>
          <td style="padding:0.5rem 0;color:var(--text-secondary);">${s.val}</td>
        </tr>
      `).join('');
      $('[data-template="specs-table"]').html(specsHtml);
      $('[data-template="specs-tab-btn"]').css('display', 'block');
    } else {
      $('[data-template="specs-wrapper"]').css('display', 'none');
      $('[data-template="specs-tab-btn"]').css('display', 'none');
    }

    // Features
    const featuresRow = featuresMap[p.id] || null;
    const featuresHtml = renderFeaturesHtml(featuresRow);
    if (featuresHtml) {
      $('[data-template="features-list"]').html(featuresHtml);
      $('[data-template="features-tab-btn"]').css('display', 'block');
    } else {
      $('[data-template="features-wrapper"]').css('display', 'none');
      $('[data-template="features-tab-btn"]').css('display', 'none');
    }

    // Set Default Active Tab
    if (featuresHtml) {
      $('[data-template="features-wrapper"]').css('display', 'block');
      $('[data-template="specs-wrapper"]').css('display', 'none');
      $('[data-template="features-tab-btn"]').addClass('active').css({'color': 'var(--text-primary)', 'border-bottom-color': 'var(--cyan)'});
      $('[data-template="specs-tab-btn"]').removeClass('active').css({'color': 'var(--text-secondary)', 'border-bottom-color': 'transparent'});
    } else if (specs.length > 0) {
      $('[data-template="specs-wrapper"]').css('display', 'block');
      $('[data-template="specs-tab-btn"]').addClass('active').css({'color': 'var(--text-primary)', 'border-bottom-color': 'var(--cyan)'});
    }

    // Downloads & Resources
    if (p.user_manual) {
      $('[data-template="resources-list"]').html(`
        <a href="${p.user_manual}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="display:inline-flex; align-items:center; gap:0.5rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          User Manual
        </a>
      `);
      $('[data-template="resources-wrapper"]').css('display', 'block');
    } else {
      $('[data-template="resources-wrapper"]').css('display', 'none');
    }

    // Variants
    const variants = childProducts.filter(v => v.parent_sku === p.sku);
    let variantJsData = 'null';
    if (variants.length > 0) {
      const allOptions = [];
      if (p.variant_value) allOptions.push(p);
      allOptions.push(...variants);
      const variantName = p.variant_name || variants[0]?.variant_name || 'Option';
      let optionsHtml = '';
      const variantMap = {};
      allOptions.forEach((opt, idx) => {
        const optInv = inventoryMap[opt.sku] || { available: 0 };
        const disabled = optInv.available <= 0 ? 'disabled' : '';
        const checked  = idx === 0 ? 'checked' : '';
        const optPrice = displayPrice(opt);
        optionsHtml += `
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:${disabled ? 'not-allowed':'pointer'};opacity:${disabled ? '0.5':'1'};padding:0.5rem 1rem;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-surface);">
            <input type="radio" name="product-variant" value="${opt.sku}" ${checked} ${disabled} onchange="window.selectVariant('${opt.sku}')" />
            <span style="font-weight:500;color:var(--text-primary);">${opt.variant_value || opt.sku}</span>
          </label>
        `;
        variantMap[opt.sku] = {
          priceStr:    formatPHP(optPrice),
          price:       optPrice,
          beforeStr:   opt.before_price > 0 ? formatPHP(opt.before_price) : null,
          available:   optInv.available,
          title:       opt.title,
          slug:        opt.slug,
          image:       opt.image_main || mainImgUrl,
        };
      });
      const variantHtml = `
        <h4 style="font-size:0.9rem;margin-bottom:0.75rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">Select ${variantName}</h4>
        <div style="display:flex;flex-wrap:wrap;gap:1rem;">${optionsHtml}</div>
      `;
      $('[data-template="variant-selector"]').html(variantHtml).css('display', 'block');
      variantJsData = JSON.stringify(variantMap);
    } else {
      $('[data-template="variant-selector"]').css('display', 'none');
    }

    // A+ Content
    if (p.aplus_content && Array.isArray(p.aplus_content) && p.aplus_content.length > 0) {
      const aplusHtml = renderAPlusContent(p.aplus_content);
      $('[data-template="aplus-content-wrapper"]').html(aplusHtml).css('display', 'block');
    } else {
      $('[data-template="aplus-content-wrapper"]').css('display', 'none');
    }

    // Inventory display
    const available = inv.available;
    const ordered   = inv.ordered_past_month;
    if (available > 0) {
      $('[data-template="status-badge"]').text('In Stock').attr('class', 'badge badge-cyan');
      let invText = `<strong style="color:var(--text-primary);">${available} available</strong> in our local warehouse. Ready to ship (delivered in 2-3 days).`;
      if (ordered > 0) invText += ` <span style="color:#f59e0b; font-weight: 500;"><svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2.5" fill="none" style="vertical-align: -2px; margin-right: 4px; display: inline-block;"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>${ordered} ordered in the last 30 days.</span>`;
      $('[data-template="inventory-text"]').html(invText);
      $('[data-template="btn-add-to-cart"]').text('Add to Cart').removeAttr('disabled');
    } else {
      $('[data-template="status-badge"]').text('Backorder').attr('class', 'badge badge-warning');
      $('[data-template="inventory-text"]').html('<span style="color:#f59e0b;font-weight:600;">Backorder</span>: Temporarily out of local stock. Fulfillment takes 3-4 weeks.');
      $('[data-template="btn-add-to-cart"]').text('Add to Cart (Backorder)').removeAttr('disabled');
    }

    // Related Products
    const relatedSkus = p.related_skus || [];
    let relatedHtml = '';
    let relCount = 0;

    if (relatedSkus.length > 0) {
      for (const sku of relatedSkus) {
        if (relCount >= 10) break;
        // Find product by SKU in products array
        const relProduct = products.find(prod => prod.sku === sku);
        if (relProduct) {
          const finalPrice = displayPrice(relProduct);
          const priceStr = formatPHP(finalPrice);
          const beforeStr = (relProduct.before_price > 0) ? formatPHP(relProduct.before_price) : null;
          const imgUrl = relProduct.image_main || '../assets/og-image.png';
          const relPromoTagsHtml = getPromoTagsHtmlForCard(relProduct.promo_tags);

          relatedHtml += `
            <div class="card product-card card--spotlight" style="position: relative; display:flex; flex-direction:column; padding: 1.25rem; border-radius:var(--radius-md); border:1px solid var(--border); background:var(--bg-surface); transition: transform 0.2s ease;">
              <a href="${relProduct.slug}.html" style="text-decoration:none; display:flex; flex-direction:column; flex:1; color:inherit;">
                <div style="aspect-ratio:1/1; width:100%; border-radius:var(--radius-sm); background:#fff; padding:0.5rem; display:flex; align-items:center; justify-content:center; overflow:hidden; margin-bottom:0.6rem;">
                  <img src="${imgUrl}" alt="${relProduct.title}" style="max-width:100%; max-height:100%; object-fit:contain;" />
                </div>
                <h4 style="font-size:0.95rem; font-weight:600; color:var(--text-primary); margin:0 0 0.35rem 0; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; line-height:1.3;">${relProduct.title}</h4>
                
                ${relPromoTagsHtml ? `<div style="display:flex; flex-wrap:wrap; gap:0.25rem; margin-bottom:0.4rem;">${relPromoTagsHtml}</div>` : ''}
                
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                  <span style="font-weight:700; color:var(--text-primary); font-size:1rem;">${priceStr}</span>
                  ${beforeStr ? `<span style="text-decoration:line-through; font-size:0.8rem; color:var(--text-secondary);">${beforeStr}</span>` : ''}
                </div>
              </a>
              <button class="btn btn-cyan btn-sm" style="width:100%; margin-top:0.5rem; font-weight:700; border-radius:var(--radius-sm);" onclick="event.preventDefault(); event.stopPropagation(); addToCart({ id: '${relProduct.sku}', title: '${relProduct.title.replace(/'/g, "\\'")}', slug: '${relProduct.slug}', price: ${finalPrice}, image: '${imgUrl}', quantity: 1 })">
                Add To Cart
              </button>
            </div>
          `;
          relCount++;
        }
      }
    }

    if (relatedHtml) {
      $('[data-template="related-products-grid"]').html(relatedHtml);
      $('[data-template="related-products-wrapper"]').css('display', 'block');
    } else {
      $('[data-template="related-products-wrapper"]').css('display', 'none');
    }

    // JS data injection
    const jsInjection = `
      <script>
        window.SUPABASE_URL  = "${SUPABASE_URL}";
        window.SUPABASE_ANON = "${SUPABASE_ANON_KEY}";
        window.VARIANTS_MAP  = ${variantJsData};
        CURRENT_PRODUCT = {
          id:    "${p.id}",
          title: \`${p.title.replace(/`/g, "\\`")}\`,
          slug:  "${p.slug}",
          price: ${mainPrice},
          image: "${mainImgUrl}",
          sku:   "${p.sku}",
          display_rating: ${p.display_rating || null},
          display_reviews_count: ${p.display_reviews_count || null},
          desc:  \`${descShort.replace(/`/g, "\\`")}\`
        };
        window.selectVariant = function(sku) {
          if (!window.VARIANTS_MAP || !window.VARIANTS_MAP[sku]) return;
          const v = window.VARIANTS_MAP[sku];
          document.querySelector('[data-template="price"]').innerHTML = v.priceStr;
          const compareEl = document.querySelector('[data-template="compare-price"]');
          if (v.beforeStr) { compareEl.innerHTML = v.beforeStr; compareEl.style.display='inline-block'; }
          else compareEl.style.display = 'none';
          document.querySelector('[data-template="sku"]').innerText = 'SKU: ' + sku;
          
          // Use switchMedia to reset gallery when variant changes
          if (window.switchMedia) {
            window.switchMedia(v.image);
          } else {
            document.querySelector('[data-template="main-image"]').src = v.image;
          }

          const badge  = document.querySelector('[data-template="status-badge"]');
          const btn    = document.querySelector('[data-template="btn-add-to-cart"]');
          const invEl  = document.querySelector('[data-template="inventory-text"]');
          if (v.available > 0) {
            badge.innerText = 'In Stock'; badge.className = 'badge badge-cyan';
            invEl.innerHTML = '<strong style="color:var(--text-primary);">' + v.available + ' available</strong> in our local warehouse. Ready to ship (delivered in 2-3 days).';
            btn.innerText = 'Add to Cart'; btn.disabled = false;
          } else {
            badge.innerText = 'Backorder'; badge.className = 'badge badge-warning';
            invEl.innerHTML = '<span style="color:#f59e0b;font-weight:600;">Backorder</span>: Temporarily out of local stock. Fulfillment takes 3-4 weeks.';
            btn.innerText = 'Add to Cart (Backorder)'; btn.disabled = false;
          }
          CURRENT_PRODUCT.sku   = sku;
          CURRENT_PRODUCT.price = v.price;
          CURRENT_PRODUCT.image = v.image;
          CURRENT_PRODUCT.slug  = v.slug;
        };
      </script>
    `;
    $('[data-template="js-product-data"]').replaceWith(jsInjection);

    // Write file
    const outPath = path.join(outDir, `${p.slug}.html`);
    await fs.writeFile(outPath, $.html(), 'utf8');
  }

  console.log(`Successfully built ${baseProducts.length} static product pages.`);
}

buildProducts();
