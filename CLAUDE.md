# Project AI Guidelines

## Supabase Initialization Rule
**JavaScript Rule**: The Supabase client is globally initialized as `const sb = window.supabase.createClient(...)` inside `js/auth.js`. 
Because `auth.js` is included on every page that requires authentication or database access, `sb` is globally available. 

- **NEVER** redeclare `const sb` in any inline scripts or other JS files included on the same page. Doing so will cause a fatal `SyntaxError: Identifier 'sb' has already been declared`.
- **ALWAYS** just use the existing `sb` variable directly for all queries (e.g., `await sb.from(...)`).

## Icons & Emoji Rule
**Always use inline SVG for icons.** Never use emojis as icons or decorative elements anywhere in the UI — not in HTML, JS-generated markup, or template strings.

## CSS & Styling Modifications Rule
**Javascript Override Check**: Whenever modifying CSS styles (like `padding`, `margin`, `display` etc.) for a specific element in the HTML or CSS files, **always** double-check if there is any inline Javascript (e.g., event listeners, UI interactions like `switchMedia()`) that aggressively overrides those same styles via `element.style.property`. 

- Many UI state switches in this codebase manually reset inline styles.
- Failing to check the Javascript logic will result in the CSS modifications seemingly "not working" because they are immediately overwritten by JS at runtime.

## Product Dropdown / Selection Rule
- **Always use the product SKU** (formatted as `[SKU] Product Title` or sorted/identified by SKU) in any product dropdown or selection list in the UI.

## Image Upload Compression Rule
- **Always compress images client-side** before uploading them to Supabase Storage.
- Convert the images to **WebP format at 80% quality** (`image/webp`) and resize them (recommended max width/height of `1200px` for general reviews or appropriate dimensions for specific content layout e.g. `650px x 950px` for portrait promotion popups) to save server space and bandwidth.

## Promotions & Checkout Intercept Rules
- **Database Rules**: Save all promotional configurations (like Upsells and Cross-sells) under the key `upsell_cross_sell` in the `global_settings` table.
- **Checkout Intercept Rule**: All storefront "Proceed to Checkout" buttons/links must route through `handleCheckoutClick(event)` in [js/cart.js](file:///Users/zeustaller/Claude/brightkey-website/js/cart.js) to intercept and display configured upsell modals before redirection.
- **Cross-sell Placement**: Recommended add-ons should render dynamically inside `<div id="cart-drawer-cross-sell">` and `<div id="cross-sell-container">` directly above coupon codes, using inline SVGs for layout icons.
- **SKU Mapping Rule**: Ensure cart items include the `sku` field so they can be matched correctly against configured promotions database rules.


