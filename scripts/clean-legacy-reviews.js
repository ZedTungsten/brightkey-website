import fs from 'fs/promises';
import path from 'path';
import * as cheerio from 'cheerio';

const files = [
  'products/premium-smart-lock.html',
  'products/hr-payroll-software.html',
  'products/minimalist-smart-deadbolt.html',
  'products/glass-door-smart-lock.html',
  'products/accounting-software.html'
];

for (const file of files) {
  const filePath = path.resolve(file);
  try {
    const html = await fs.readFile(filePath, 'utf8');
    const $ = cheerio.load(html);

    // Reset average rating and total ratings counts
    $('#avg-rating-display').text('0.0');
    $('#total-reviews-display').text('0');

    // Reset the stars element styling and text
    const starsDiv = $('#avg-rating-display').next().find('div').first();
    if (starsDiv.length) {
      starsDiv.css('color', 'var(--border)');
      starsDiv.text('☆☆☆☆☆');
    }

    // Set reviews container to default placeholder
    $('#reviews-container').html('<p style="color:var(--text-secondary);">No reviews yet. Be the first to review this product!</p>');

    await fs.writeFile(filePath, $.html(), 'utf8');
    console.log(`Cleaned legacy reviews for: ${file}`);
  } catch (err) {
    console.error(`Failed to clean ${file}:`, err.message);
  }
}
