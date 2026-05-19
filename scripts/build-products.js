import fs from 'fs/promises';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as cheerio from 'cheerio';

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
  console.log('Fetching products from Supabase for visual SSG...');
  
  const { data: products, error } = await supabase
    .from('products')
    .select('*, inventory(available, ordered_past_month), product_images(*), reviews(*)')
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

  // Read visual template
  const templatePath = path.resolve('./product-preview.html');
  const templateHtml = await fs.readFile(templatePath, 'utf8');

  const baseProducts = products.filter(p => !p.parent_sku);
  const childProducts = products.filter(p => p.parent_sku);

  for (const p of baseProducts) {
    console.log(`Building static page for: ${p.slug}`);

    // Load template into Cheerio
    const $ = cheerio.load(templateHtml);

    // Inventory calculations
    let available = 0;
    let ordered = 0;
    if (p.inventory && p.inventory.length > 0) {
      available = p.inventory[0].available;
      ordered = p.inventory[0].ordered_past_month;
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

    const priceStr = formatPHP(p.price);
    const descStr = p.description || '';
    const descShort = p.description ? p.description.substring(0, 160) : '';

    // Fix relative paths for the subfolder
    $('link[href^="css/"]').attr('href', (i, val) => '../' + val);
    $('link[href^="assets/"]').attr('href', (i, val) => '../' + val);
    $('script[src^="js/"]').attr('src', (i, val) => '../' + val);
    $('a[href="index.html"]').attr('href', '../index.html');
    $('a[href="about.html"]').attr('href', '../about.html');
    $('a[href="products.html"]').attr('href', '../products.html');
    $('a[href="contact.html"]').attr('href', '../contact.html');
    $('a[href="cart.html"]').attr('href', '../cart.html');
    $('a[href="privacy-policy.html"]').attr('href', '../privacy-policy.html');
    $('a[href="terms-of-use.html"]').attr('href', '../terms-of-use.html');
    $('img[src^="assets/"]').not('[data-template="main-image"]').attr('src', (i, val) => '../' + val);

    // Apply Meta Tags
    $('[data-template="meta-desc"]').attr('content', descShort);
    $('[data-template="meta-title"]').text(`${p.title} — BrightKey`);
    $('[data-template="og-url"]').attr('content', `https://brightkeysolutions.com/products/${p.slug}`);
    $('[data-template="og-title"]').attr('content', `${p.title} — BrightKey`);
    $('[data-template="og-desc"]').attr('content', descShort);
    $('[data-template="og-image"]').attr('content', mainImgUrl);
    
    // Reviews Calculation
    const approvedReviews = p.reviews ? p.reviews.filter(r => r.is_approved) : [];
    let avgRating = 0;
    if (approvedReviews.length > 0) {
      const total = approvedReviews.reduce((sum, r) => sum + r.rating, 0);
      avgRating = (total / approvedReviews.length).toFixed(1);
    }
    
    // Update Review Summary DOM Statically
    if (approvedReviews.length > 0) {
      $('#avg-rating-display').text(avgRating);
      $('#total-reviews-display').text(approvedReviews.length);
    } else {
      $('#avg-rating-display').text('0.0');
      $('#total-reviews-display').text('0');
    }

    // Apply JSON-LD
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
        "price": (p.price / 100).toFixed(2),
        "availability": available > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        "itemCondition": "https://schema.org/NewCondition"
      }
    };
    
    if (approvedReviews.length > 0) {
      jsonLd.aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": avgRating,
        "reviewCount": approvedReviews.length
      };
    }
    
    $('[data-template="json-ld"]').replaceWith(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);

    // Apply DOM Content
    $('[data-template="breadcrumb-title"]').text(p.title);
    $('[data-template="main-image"]').attr('src', mainImgUrl);
    $('[data-template="thumbnails-container"]').html(thumbnailsHtml);
    $('[data-template="category"]').text(p.category);
    $('[data-template="sku"]').text(p.sku ? `SKU: ${p.sku}` : '');
    $('[data-template="title"]').text(p.title);
    $('[data-template="price"]').text(priceStr);
    $('[data-template="description"]').text(descStr);

    // Variants Processing
    const variants = childProducts.filter(v => v.parent_sku === p.sku);
    let variantJsData = 'null';
    if (variants.length > 0) {
      const allOptions = [];
      if (p.variant_value) allOptions.push(p);
      allOptions.push(...variants);
      
      const variantName = p.variant_name || variants[0].variant_name || 'Option';
      let optionsHtml = '';
      
      const variantMap = {};
      allOptions.forEach((opt, idx) => {
        let optAvailable = 0;
        if (opt.inventory && opt.inventory.length > 0) optAvailable = opt.inventory[0].available;
        const disabled = optAvailable <= 0 ? 'disabled' : '';
        const checked = idx === 0 ? 'checked' : '';
        const priceStrOpt = formatPHP(opt.price);
        
        optionsHtml += `
          <label style="display:flex; align-items:center; gap:0.5rem; cursor:${disabled ? 'not-allowed' : 'pointer'}; opacity:${disabled ? '0.5' : '1'}; padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-surface);">
            <input type="radio" name="product-variant" value="${opt.sku}" ${checked} ${disabled} onchange="window.selectVariant('${opt.sku}')" />
            <span style="font-weight:500; color:var(--text-primary);">${opt.variant_value}</span>
          </label>
        `;

        variantMap[opt.sku] = {
          priceStr: priceStrOpt,
          price: opt.price,
          compareStr: opt.compare_at_price > opt.price ? formatPHP(opt.compare_at_price) : null,
          available: optAvailable,
          title: opt.title,
          slug: opt.slug,
          image: (opt.product_images && opt.product_images.length > 0) ? opt.product_images[0].cdn_url : mainImgUrl
        };
      });

      const variantHtml = `
        <h4 style="font-size:0.9rem; margin-bottom:0.75rem; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Select ${variantName}</h4>
        <div style="display:flex; flex-wrap:wrap; gap:1rem;">
          ${optionsHtml}
        </div>
      `;
      $('[data-template="variant-selector"]').html(variantHtml).show();
      variantJsData = JSON.stringify(variantMap);
    } else {
      $('[data-template="variant-selector"]').hide();
    }

    // Features Processing
    if (p.features && Object.keys(p.features).length > 0) {
      let featuresHtml = '';
      for (const [key, value] of Object.entries(p.features)) {
        if (value) {
          // Format key: "pin_unlock" -> "PIN Unlock"
          let displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          if (displayKey.toLowerCase() === 'pin unlock') displayKey = 'PIN Unlock';
          if (displayKey.toLowerCase() === 'rfid unlock') displayKey = 'RFID Unlock';
          
          let displayText = displayKey;
          if (value !== 'X' && value !== true && value !== 'true') {
            displayText += ` (${value})`;
          }

          featuresHtml += `
            <li style="display:flex; align-items:center; gap:0.5rem; font-size:0.95rem; color:var(--text-secondary);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
              ${displayText}
            </li>
          `;
        }
      }
      if (featuresHtml) {
        $('[data-template="features-list"]').html(featuresHtml);
      } else {
        $('[data-template="features-wrapper"]').hide();
      }
    } else {
      $('[data-template="features-wrapper"]').hide();
    }

    // Resources Processing
    if (p.resources && Object.keys(p.resources).length > 0) {
      let resourcesHtml = '';
      for (const [key, url] of Object.entries(p.resources)) {
        if (url) {
          let displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          resourcesHtml += `
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" style="display:inline-flex; align-items:center; gap:0.5rem;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              ${displayKey}
            </a>
          `;
        }
      }
      if (resourcesHtml) {
        $('[data-template="resources-list"]').html(resourcesHtml);
      } else {
        $('[data-template="resources-wrapper"]').hide();
      }
    } else {
      $('[data-template="resources-wrapper"]').hide();
    }

    if (p.compare_at_price && p.compare_at_price > p.price) {
      $('[data-template="compare-price"]').text(formatPHP(p.compare_at_price)).show();
    } else {
      $('[data-template="compare-price"]').hide();
    }

    let inventoryText = 'Currently out of stock. Please contact us for restock dates.';
    if (available > 0) {
      $('[data-template="status-badge"]').text('In Stock').attr('class', 'badge badge-cyan');
      inventoryText = `<strong style="color:var(--text-primary);">${available} available</strong> in our local warehouse.`;
      if (ordered > 0) {
        inventoryText += ` <span style="color:#f59e0b;">🔥 ${ordered} ordered in the last 30 days.</span>`;
      }
      $('[data-template="btn-add-to-cart"]').text('Add to Cart').removeAttr('disabled');
    } else {
      $('[data-template="status-badge"]').text('Out of Stock').attr('class', 'badge badge-muted');
      $('[data-template="btn-add-to-cart"]').text('Out of Stock').attr('disabled', 'true');
    }
    $('[data-template="inventory-text"]').html(inventoryText);

    // Inject JS Data
    const jsInjection = `
      <script>
        window.SUPABASE_URL = "${SUPABASE_URL}";
        window.SUPABASE_ANON = "${SUPABASE_ANON_KEY}";
        window.VARIANTS_MAP = ${variantJsData};
        
        CURRENT_PRODUCT = {
          id: "${p.id}",
          title: \`${p.title}\`,
          slug: "${p.slug}",
          price: ${p.price},
          image: "${mainImgUrl}",
          sku: "${p.sku}"
        };

        window.selectVariant = function(sku) {
          if (!window.VARIANTS_MAP || !window.VARIANTS_MAP[sku]) return;
          const v = window.VARIANTS_MAP[sku];
          
          // Update DOM Elements dynamically
          document.querySelector('[data-template="price"]').innerText = v.priceStr;
          
          const compareEl = document.querySelector('[data-template="compare-price"]');
          if (v.compareStr) {
            compareEl.innerText = v.compareStr;
            compareEl.style.display = 'inline';
          } else {
            compareEl.style.display = 'none';
          }
          
          document.querySelector('[data-template="sku"]').innerText = 'SKU: ' + sku;
          document.querySelector('[data-template="main-image"]').src = v.image;
          
          const badgeEl = document.querySelector('[data-template="status-badge"]');
          const btnCartEl = document.querySelector('[data-template="btn-add-to-cart"]');
          const invTextEl = document.querySelector('[data-template="inventory-text"]');
          
          if (v.available > 0) {
            badgeEl.innerText = 'In Stock';
            badgeEl.className = 'badge badge-cyan';
            invTextEl.innerHTML = '<strong style="color:var(--text-primary);">' + v.available + ' available</strong> in our local warehouse.';
            btnCartEl.innerText = 'Add to Cart';
            btnCartEl.disabled = false;
          } else {
            badgeEl.innerText = 'Out of Stock';
            badgeEl.className = 'badge badge-muted';
            invTextEl.innerText = 'Currently out of stock. Please contact us for restock dates.';
            btnCartEl.innerText = 'Out of Stock';
            btnCartEl.disabled = true;
          }

          // Update CURRENT_PRODUCT so cart gets the correct variant details
          CURRENT_PRODUCT.sku = sku;
          CURRENT_PRODUCT.price = v.price;
          CURRENT_PRODUCT.image = v.image;
          CURRENT_PRODUCT.slug = v.slug;
        };
      </script>
    `;
    $('[data-template="js-product-data"]').replaceWith(jsInjection);

    // Write final HTML
    const outFilePath = path.join(outDir, `${p.slug}.html`);
    await fs.writeFile(outFilePath, $.html(), 'utf8');
  }

  console.log(`Successfully built ${baseProducts.length} static parent product pages.`);
}

buildProducts();
