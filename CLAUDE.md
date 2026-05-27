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

## Git & Deployment Rule
- **Always push to git live** immediately after refactoring, coding, or finalizing any changes in local.

## Script Refactoring & Tab Creation Rule
- **Prevent Duplicate Declarations**: When extending pages (such as adding new tabs, forms, or scripts), **never** duplicate let/const variables or key globals (e.g., `allProducts`, `allBusinesses`, `initialPromoState`). JavaScript throws a fatal compile-time `SyntaxError: Identifier 'x' has already been declared` if these are redeclared in the same scope, which crashes the script engine and renders tabs and elements unclickable. Always check the top of the file for existing variable and function declarations.



