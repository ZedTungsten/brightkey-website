# Project AI Guidelines

## Supabase Initialization Rule
**JavaScript Rule**: The Supabase client is initialized as `var sb = window.supabase.createClient(...)` inside `js/auth.js` (`var` is intentional — it avoids `SyntaxError: Identifier 'sb' already declared` when page-level inline scripts also declare their own `const sb`). `auth.js` is included on every page that requires authentication or database access, making `sb` available globally via `window.BKAuth.sb` and as a plain `sb` variable.

- **NEVER** redeclare `const sb` in `auth.js` — keep it as `var sb`. If changed to `const`, it will conflict with any page inline script that also has `const sb`, crashing the page with a fatal SyntaxError.
- Page-level inline scripts MAY declare their own `const sb = window.supabase.createClient(...)` for convenience — this does NOT conflict with `auth.js`'s `var sb` because `var` is reassignable and `const` in a separate script tag occupies a separate lexical scope.
- **ALWAYS** use the existing `sb` variable for all queries (e.g., `await sb.from(...)`). Do not create unnecessary extra Supabase clients.

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

## DOMContentLoaded & Script Load Order Rule

**Understand the exact browser execution order for this codebase:**

1. **Inline `<script>` blocks** — run immediately during HTML parsing, in document order.
2. **`<script defer>`** (e.g. `auth.js`) — runs after the full HTML is parsed, **before** `DOMContentLoaded` fires.
3. **`DOMContentLoaded` handlers** (e.g. `document.addEventListener('DOMContentLoaded', ...)`) — fire last, after all deferred scripts have run.

**Rules to follow:**

- **Never call DOM-querying functions (e.g. `renderXyz()`, `fetchData()`, `document.getElementById()`) at the top level of an inline script.** They must always be wrapped inside a `DOMContentLoaded` listener or placed after the relevant HTML in the file — otherwise the DOM elements don't exist yet and the calls silently fail.
- **All data-fetching and render initialization must live inside `DOMContentLoaded`**, or be triggered by it (e.g. calling `fetchPromoData()` inside the listener). Never rely on inline script execution order to guarantee elements exist.
- **Render functions must always be called unconditionally.** Do not gate a render call (e.g. `renderUpsellRules()`) behind a `if (!error && data)` check — if the DB row doesn't exist yet, the function never runs and the panel stays blank. Always call renders so empty-state messages appear.
- **`auth.js` is `defer` and declares `const sb`.** Because it runs before `DOMContentLoaded`, `sb` and `window.BKAuth` are available inside any `DOMContentLoaded` handler. Do NOT redeclare `sb` in inline scripts on pages that also load `auth.js`.
- **When adding new tabs or sections to a page with an existing `DOMContentLoaded` setup**, add initialization calls (renders, data loads) inside the existing listener — never create a second `DOMContentLoaded` listener on the same page. Multiple listeners fire in registration order but are easy to lose track of and cause race conditions.

## HTML Nesting & Tag Closure Rule
- **Always verify div and tag closures when adding tabs or layout components**: A missing closing tag (e.g. a missing `</div>`) can silently nest subsequent tabs/sections inside the unclosed container. This causes elements to disappear or display incorrectly when the parent element is hidden (`display: none` / active tab toggling).

## Error Logging & Debugging Rule
- **Always print or log errors**: For any data-fetching, database query, layout parsing, or critical function execution, **always** include comprehensive error catch blocks.
  - Print descriptive errors in the browser console using `console.error('Context:', error)`.
  - Where user/admin visibility is useful, render errors directly in the UI (e.g. inside tables or containers via `.innerHTML` or toast notifications) so problems are obvious and immediately diagnosed.

## Unified Supabase Access Pattern
- **Assign from `window.BKAuth.sb` within entry points**: Pages loading `auth.js` should declare `let sb` at the script level and assign `sb = window.BKAuth.sb` inside their entry function (e.g. `App.init()` or `DOMContentLoaded` listener) rather than recreating client instances. Pages that do not load `auth.js` must declare and create `const sb` locally.## Prevent Duplicate Script Loading
- **Check for existing tags**: If a script is dynamically loaded via JavaScript (e.g. in `main.js`), always check if a script tag targeting that file already exists in the document (`document.querySelector('script[src*="filename.js"]')`) before appending it. This prevents race conditions, duplicate execution, and `SyntaxError` declarations.

## Type-Safe UUID Queries (Supabase/Postgrest)
- **Sanitize identifiers**: When querying a UUID column (like `id` in the `products` table) using `.in()` or `.or()`, filter out strings like `"undefined"` or `"null"`. Passing non-UUID strings to a UUID column query triggers a database type mismatch (`22P02` error) and returns a `400 (Bad Request)` response.

## Database Schema Columns Selection
- **Verify Column Names**: Always double-check actual database column names (either via schema migration files in `database/migrations/` or by running a quick select query in a test script) before reference declarations or executing query select statements. Do not guess column names (e.g. assuming `price` instead of `before_price` or `sale_price`), as referencing non-existent columns will result in a fatal `400 (Bad Request)` / `42703` column undefined error.

## Direct SKU Extraction
- **Cart SKU Fallback**: When checking for products inside the cart, do not rely solely on matching UUIDs (`id` property) and querying the database to resolve their SKUs. Cart items already hold their SKU on the `sku` property (e.g. `item.sku`). Always attempt to read `item.sku` directly to resolve cart items instantly.

## Multi-Tenant Company ID Resolution Rule
- **`BKAuth.checkRoleGate()` does NOT return `companyId`**: It returns `{ user, role, tenantId }`.
- **Retrieve `companyId` dynamically**: To obtain the `company_id` for queries, use the `tenantId` to query the `companies` table:
  ```javascript
  const { data: companyData } = await sb.from('companies').select('id').eq('tenant_id', tenantId).limit(1);
  const companyId = companyData?.[0]?.id;
  ```
- **Never guess `authInfo.companyId`**: Attempting to read `authInfo.companyId` directly returns `undefined`, which triggers a database type mismatch error (`invalid input syntax for type uuid: "undefined"`) when used in queries.
- **Ensure Scoped Data Creation**: All new data entries and operations (inserts, updates, upserts) must explicitly include `company_id` (e.g. `company_id: currentCompanyId`) to ensure strict compliance with database Row-Level Security (RLS) policies. Failure to scope writes will cause silent write rejections or query failures.

## Toast Notification Stacking Rule
- **Toast z-index must be `99999`**: To guarantee that toast notifications are visible over dark modal overlays, blur filters, and lateral drawers (which typically sit between `100` and `2000` z-index), always style `#toast-container` with `z-index: 99999`.
- **Target `#toast-container` by ID**: Style rules must target `#toast-container` (ID selector) rather than `.toast-container` (class selector). This ensures page-specific overrides have the specificity required to override any rules inside the global `css/style.css` stylesheet.

## Button Styling Guidelines
## UI Alerts and Dialogs Rule
- **Never use standard browser alert boxes** (`alert(...)`). Standard browser alerts block the main thread and degrade the user experience.
- **For form validation errors**, highlight the invalid input fields directly in red (`borderColor = '#EF4444'`) and scroll them into view.
- **For status alerts or other general messages**, always use styled UI dialog boxes, modals, or toast notifications (targeting `#toast-container` with z-index `99999`) instead of browser-native popups.
 
## Database Currency & Pricing Rule
- **Always store currency/pricing values as integers in centavos (cents)**: To prevent floating-point rounding errors during financial calculations and maintain database consistency, all price-related columns in the database (e.g., `sale_price`, `installation_price`, `subtotal`, `charges`, `deductions`, `grand_total`, `deposit_amount`, `balance_due`) must be stored as `INTEGER` representing centavos (e.g., `10000` = ₱100.00).
- **Convert on frontend input/display**: Convert these integer values on the frontend by dividing by `100` for human-readable display (e.g., `(cents / 100).toLocaleString(...)`) and multiplying raw numeric user inputs by `100` (e.g., `Math.round(parseFloat(input) * 100)`) before submitting payloads to the database.
