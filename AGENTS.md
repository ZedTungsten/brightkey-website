# BrightKey Multi-Tenant ERP Security Architecture & Guidelines (`AGENTS.md`)

> [!CRITICAL]
> **AGENT PROTOCOL**: Do NOT rely on your generic training data first to debug or write solutions. The solution or constraints for recurring problems are already documented in this file, `CLAUDE.md`, and `DESIGN.md`. Before proposing any code modifications, always search these files first to see how the problem was solved before.

---

## 1. Secure & Isolated Multi-Tenancy (Row-Level Security)
We employ Postgres Row-Level Security (RLS) on all tables to enforce strict data isolation between tenants. Users can never view, insert, update, or delete data belonging to another tenant.

### Strict Data Isolation Rules
- **RLS is Enabled by Default**: Every table containing sensitive configurations, orders, bookings, invoices, or third-party keys must have RLS explicitly enabled:
  ```sql
  ALTER TABLE public.<table_name> ENABLE ROW LEVEL SECURITY;
  ```
- **Tenant Verification Policies**: RLS policies authenticate users based on their association in the `tenant_members` table matching the database user id (`auth.uid()`):
  ```sql
  CREATE POLICY "Allow company members read integrations" ON public.company_integrations
    FOR SELECT USING (
      company_id IN (
        SELECT c.id FROM public.companies c
        JOIN public.tenant_members tm ON c.tenant_id = tm.tenant_id
        WHERE tm.user_id = auth.uid()
      )
    );
  ```

---

## 2. Industry Standard Multi-Tenant ERP Design
To keep our multi-tenant architecture modular, extensible, and clean:
- **No Shared Keys / Credentials**: All API keys, tokens, and payment portal configurations (e.g. Paymongo) are stored in dedicated integration tables (e.g., `company_integrations`) rather than hardcoded environment variables or global settings.
- **Relational Integrity**: Records are bound directly to `companies.id` or `tenants.id`, cascade-deleted on tenant termination to avoid orphan/leak residues, and indexed for speed and security filters.

---

## 3. SQL & HTML Injection Prevention
We enforce rigorous practices to prevent SQL injections (SQLi) and Cross-Site Scripting (XSS).

### Database Layer: Parameterized Queries
- **No Raw SQL Construction**: All database interactions from the client are routed through PostgREST (via Supabase Client), which natively uses parameterized execution on the server.
- **Strict Data Types**: Database columns use precise types (`UUID` for keys, `INTEGER` for currency in centavos, `TIMESTAMPTZ` for timestamps, and checks on enum strings) rather than loose text containers.

### Frontend Layer: Output Scrubbing & Value Binding
- **Direct Property Binding**: Never use `innerHTML` to render raw user-entered data or sensitive keys in the DOM. Always assign via `.value` or `.textContent`:
  ```javascript
  // SAFE: Browser handles escaping natively
  document.getElementById('paymongo-public-key').value = integration.paymongo_public_key;
  ```
- **Sanitizing Injected Data**: When HTML templates are rendered dynamically, pass all values through escaping helper routines (e.g., `esc(value)`) to convert `<` and `>` into HTML entities.

---

## 4. Protected Profiles & Sensitive Key Obfuscation
- **Credential Masking**: Input elements designed to store sensitive tokens use `type="password"` by default, preventing credentials from being read off-screen. Eyeball toggle icons allow controlled visibility.
- **Obfuscated Key Storage**: Keys are hidden from public pages and are only pulled from Supabase inside auth-checked admin routes. No credentials are leaked to the public client storefront pages.
- **Role Gating**: All dashboard route handlers run an auth-check gate matching the user's role:
  ```javascript
  const authInfo = await window.BKAuth.checkRoleGate(['Sales', 'Operations'], '../admin.html');
  ```
  This guarantees that non-admin and non-tenant accounts are booted before the browser can fetch or draw sensitive forms.
  - **Module Casing & Robustness**: Standard database modules are capitalized (e.g. `['Sales', 'Operations', 'Logistics', 'Finance', 'HR', 'Products', 'Marketing', 'Customer Service']`). However, the `checkRoleGate()` function is designed to match names **case-insensitively** to prevent access/redirect failures from minor casing mismatches. Always declare route gates using the standard capitalized naming conventions for consistency.

---

## 5. Critical Auth Gating: tenantId vs. companyId
> [!IMPORTANT]
> A common recurring bug is confusing `tenantId` with `companyId`. Always remember:
> - **`window.BKAuth.checkRoleGate()` returns `tenantId`, NOT `companyId`**:
>   ```javascript
>   const authInfo = await window.BKAuth.checkRoleGate(['owner', 'admin', 'hr'], '../admin.html');
>   // authInfo.tenantId is populated, but authInfo.companyId is UNDEFINED!
>   ```
> - **Always resolve `companyId` by querying the `companies` table**:
>   Passing `undefined` (or the string `"undefined"`) into UUID-typed columns triggers a database UUID syntax error: `invalid input syntax for type uuid: "undefined"`.
>   To get `companyId`, query the `companies` table using `tenantId`:
>   ```javascript
>   const { data: co } = await getSb().from('companies').select('id').eq('tenant_id', authInfo.tenantId).limit(1).maybeSingle();
>   const companyId = co?.id || null;
>   ```
> - **Guarding Against Null/Blank UUID Queries**:
>   When passing UUID parameters into database filters (e.g., `.eq('company_id', companyId)` or `.in('competitor_id', compIds)`), always verify that they are not `null`, `undefined`, or `"null"` strings before running the query. If the values are not yet resolved, defer execution or handle it gracefully to avoid throwing a `22P02: invalid input syntax for type uuid: "null"` error:
>   ```javascript
>   if (!companyId || companyId === 'null') {
>     return; // Defer or handle gracefully
>   }
>   ```

---

## 5.1 JavaScript Module Size & Route Chunks
> [!IMPORTANT]
> Run `npm run check:module-size` with normal linting. New modules under
> `dashboard/` and `js/` are limited to 1,000 lines. Existing exemptions in
> `scripts/module-size-baseline.json` may shrink but never grow; never raise a
> baseline to pass. Extract route-specific chunks, retain only genuinely shared
> auth/tenant/UI helpers globally, and remove exemptions once files reach 1,000
> lines.

## 5.2 Optimization Must Preserve Visibility and Workflow Semantics
> [!CRITICAL]
> **AN OPTIMIZATION IS NOT ALLOWED TO CHANGE WHO OR WHAT A VALID TENANT USER CAN SEE**:
> Performance work may reduce payload size, query count, scan size, or render
> cost, but it must preserve the existing authorized result set, historical
> references, and workflow side effects. Treat visibility and downstream
> synchronization as part of the query contract.

### 5.2.1 Never Turn a Performance Filter into an Authorization Rule
- RLS plus explicit tenant/company boundaries provide isolation. Never add role,
  department, creator, assignee, warehouse, employee-self, or similar filters
  merely to reduce rows; they require an explicit business rule.
- Tenant-wide profiles, chat, schedules, rankings, assignments, and historical
  identities must remain resolvable. Investigate narrowed related-row queries
  before displaying `Unknown` or blanks. Badge/count and list predicates must
  remain equivalent.

### 5.2.2 Active-Only Filters Belong Only Where the Business Action Requires Them
- Login gates and new-assignment selectors may exclude inactive employees;
  historical adjustments, payouts, schedules, sales, chat, approvals,
  assignments, invoices, and audits may not. Keep a tenant-wide identity map and
  derive a separate active selectable list. Disable login at the auth gate.

### 5.2.3 SKU and Product Visibility Must Remain Tenant-Wide
- Shared SKUs remain visible across booking, invoices, warehouse, sales, and
  history regardless of creator/employee. Inventory-only rules such as
  `count_inventory = false` must not hide products elsewhere. Preserve
  `products.id`, `sku`, `company_id`, and join keys.

### 5.2.4 Narrow Projections Must Include the Full Downstream Data Contract
- Before narrowing `.select('*')`, trace renderers, helpers, sorting/grouping,
  fallbacks, background sync, and write-payload builders; search the full call
  path for every `record.field`. Missing downstream fields are release-blocking
  even when failure is silent. Use a documented projection constant/mapper for
  shared shapes.

### 5.2.5 Never Break Order-to-Workflow Handoffs
- Preserve booking/invoice → reserved transaction → Inspect → Pack → Dispatch →
  Receive. Verify generated `inventory_transactions` ownership, warehouse,
  reference, SKU, quantity, type, status, and transitions—not only source-page
  visibility. Never remove fields used for downstream writes.
- Backfills must be company/reference scoped, idempotent, and guarded by
  `NOT EXISTS`/conflict handling; never overwrite or advance existing history.

### 5.2.6 Required Before/After Regression Audit
For every optimization that changes database projections, filters, RLS policies,
shared loaders, lookup maps, or synchronization:

1. Record representative before/after results and side effects.
2. Test owner/admin and regular users; active and historically referenced
   inactive employees; another same-tenant user's records; and cross-tenant
   isolation.
3. Test another user's SKUs, badge/list equivalence, and a production-shaped
   order through the complete workflow handoff.
4. Confirm no valid record becomes unknown, blank, missing, or inaccessible.

### 5.2.7 Definition of Done
Authorized results, historical identities, shared SKUs, downstream fields,
generated rows, status transitions, and badge/list agreement must remain
equivalent in authenticated owner/admin and regular-user tests. Any intentional
visibility change requires separate approval and product/security testing.

---

## 5.3 Database Query Performance & Disk IO Budget
> [!CRITICAL]
> **DATABASE EFFICIENCY IS A BUILD REQUIREMENT, NOT A LATER OPTIMIZATION TASK**:
> Every new dashboard feature must be designed so its normal page load remains
> bounded as the tenant's data grows. A query that is acceptable with test data
> but scans a complete operational table is not production-ready.

### 5.3.1 Never Run Operational Audits from Global Components
- Global auth/sidebar/header/chat/badge code must not load operational
  collections. Run audits on feature routes; use company-scoped counts, boolean
  RPCs, cached summaries, or materialized summaries globally.

### 5.3.2 Tenant Ownership Is Mandatory on Reads and Writes
- Validate `companyId` first. Every company-owned read includes the company
  boundary in addition to RLS; every insert/upsert writes `company_id`.
- New ownership columns are `NOT NULL` unless absence is documented. Safely
  backfill existing rows first. `company_id.is.null` is migration compatibility
  only; never create new null-owned rows.

### 5.3.3 No Unbounded Collection Queries
- Growing collections require server pagination or a strict start/end date
  window. Filter/order before `.range()`/`.limit()`; default pages normally load
  50–100 rows. Larger limits need a reason and hard ceiling. Prefer cursors for
  rapidly growing tables; never fetch thousands merely to process client-side.

### 5.3.4 Select Only the Fields the View Uses
- List queries use narrow projections, especially for JSON/media/attachment/
  conversation/audit tables. Load full details on demand; `.select('*')` needs a
  justified single-record consumer. Follow Section 5.2.4 and always include
  `products.id`.

### 5.3.5 Eliminate N+1 Database Requests
- Do not put avoidable reads/writes in loops. Collect IDs/SKUs/references, fetch
  with bounded `.in(...)` batches, and build lookup maps. Batch equal-value
  updates; use an RPC/transaction for atomic inventory changes.

### 5.3.6 Indexes Must Match Real Query Shapes
- Inspect live schema and `pg_stat_statements` first. Composite indexes put
  equality/tenant columns before range/order columns; confirm with `EXPLAIN`.
  Never add speculative indexes. Use rerunnable migrations such as
  `CREATE INDEX IF NOT EXISTS`.

### 5.3.7 Cache and Refresh Deliberately
- **Fetch once, share safely, refresh deliberately.** Reuse one in-flight Promise
  or page result for identical concurrent callers; clear it in `finally` so
  failures retry.
- Batch point reads only when table, tenant scope, lifecycle, authorization, and
  failure semantics match. Example: fetch several `global_settings` keys with
  one company-scoped `.in('key', keys)` query and map by key.
- Cache at the narrowest safe scope. Keys include every result-changing input
  (`company_id`, user/employee, record, filters, date range); never reuse after
  user/tenant changes.
- Refresh only after a relevant successful mutation, user/tenant change, scoped
  Realtime event, or documented low-frequency expiry—not rerender/reopen/init.
- Do not implement aggressive polling for sidebar status or counters.
- Persistent business configuration follows Section 19 and belongs in
  `global_settings`; do not misuse browser storage as a cross-page database cache.
- Never reduce requests by narrowing authorized visibility. Apply the Section 5.2
  result-set/workflow contract and test concurrency, refresh, tenant switching,
  failure/retry, historical identities, and same-tenant records.

### 5.3.8 Mandatory Pre-Deployment Query Audit
For any feature that adds or changes database access:

1. Inspect each live table with `node scripts/db-inspect.js <table_name>`.
2. Audit `.select('*')`, DB calls in loops, missing ownership on writes,
   unbounded collections, and operational scans in global code.
3. Run targeted lint/syntax/module-size checks and authenticated affected-route
   tests; confirm loading completes, records remain visible, and errors are safe.
4. For high-volume paths, compare `pg_stat_statements` calls, total/mean time,
   shared/temp blocks, then review Supabase health after a business cycle.
5. Complete the Section 5.2 before/after visibility and workflow audit.

### 5.3.9 Definition of Done
A feature is complete only when ownership is explicit, collections are bounded,
projections cover the full contract, avoidable N+1 access is gone, indexes are
evidence-backed, global code performs no feature scan, production-shaped route
tests pass, and query growth follows the requested page/report rather than the
tenant's lifetime dataset.

---

## 6. Prohibited Browser Dialogs (alert, confirm, prompt)
> [!IMPORTANT]
> Standard browser dialogs (`alert()`, `confirm()`, `prompt()`) are strictly prohibited in the ERP dashboard. Always use custom-styled overlay modal components to provide a premium user experience and maintain unified design aesthetics.

---

## 7. No Emojis Policy
> [!IMPORTANT]
> Emojis are strictly prohibited as visual icons or decorative elements anywhere in the UI (HTML markup, template strings, or CSS). Always use custom-styled SVG paths or text indicators to maintain professional branding and design consistency.

---

## 8. Tabs Component Design
Reuse the `/dashboard/fulfillment` `.drawer-tabs`/`.tab-btn` pattern. Required
behavior: flex row, horizontal overflow, surface background, bottom border;
nowrap 600-weight buttons with muted text and a transparent 2px underline;
active tabs use `--cyan-light`/`--cyan`, and inactive hover uses
`--text-secondary`. Do not invent a parallel tab system.

---

## 9. Product Page Build Policy
> [!IMPORTANT]
> Do not run `npm run build` or regenerate `products/*.html` as a routine pre-push step. Product pages are static generated output and rebuilding them touches many files, which wastes time and review budget when unrelated dashboard or backend changes are being pushed.

Only run `npm run build` when one of the following is true:
- The user explicitly asks to update or rebuild product pages.
- Changes were made to `dashboard/product-preview.html`.
- Changes were made to `scripts/build-products.js`.
- The requested work directly affects generated product pages under `products/*.html`.

For ordinary dashboard, JavaScript, CSS, migration, or non-product-page changes, prefer targeted checks instead of rebuilding product pages.

---

## 10. Strict UI Design System Compliance (`DESIGN.md`)
> [!IMPORTANT]
> Read `/DESIGN.md` in full before changing HTML, CSS, frontend JS, layouts,
> animations, or overrides. Reuse its scroll, modal, loading, sticky-table, and
> layout patterns; do not create competing implementations.

---

## 11. HTML Syntax & Tag Validation (Anti-Overcomplication Policy)
> [!IMPORTANT]
> For invisible, misaligned, or unresponsive UI, validate DOM nesting and closing
> tags first. Do not add CSS/reflow/transition workarounds before syntax is sound.

---

## 12. Dashboard Modal Implementation Patterns
Do not mix modal systems. `/dashboard/team` uses instant overlay display plus a
card keyframe, so JS only toggles `.open`. The global `DESIGN.md` transition
pattern hides with opacity/pointer-events and opens by setting `display: flex`,
forcing reflow (`modal.offsetHeight`), then adding `.open`. Match the route's
existing pattern exactly.

---

## 13. Strict Database Schema Validation (Anti-Hallucination Policy)
> [!CRITICAL]
> **VERIFY DATABASE SCHEMA BEFORE CODING**:
> Never guess database column names, primary keys, or relationships when writing SQL queries or front-end data bindings. Local migration files can deviate from the live database, so do NOT trust them as the single source of truth.
> - **First Action**: Always inspect the live table columns by running:
>   `node scripts/db-inspect.js <table_name>`
> - **Common Mismatches to Avoid**:
>   * `employees` uses `email` (NOT `email_address`).
>   * `installation_bookings` uses `scheduled_date` (NOT `schedule_date`).
>   * `installation_bookings` uses `order_no` (NOT `booking_number`).
>   * Currency fields are stored in centavos (integers) rather than decimals.
> Doing this check proactively prevents back-and-forth debugging from column mismatches and ensures immediate functionality.


---

## 14. Dynamic Settings Layouts & Scrolling Safety
> [!IMPORTANT]
> When building or modifying tabbed setting views or control panels containing list builders (e.g., checklist builders, media requirements) that can dynamically grow or shrink:
> - **Avoid Multi-Flex Stretching**: Do not assign `flex: 1` or `height` constraints on multiple sibling list containers (like `.table-scroll`) inside a single tab/panel page. Doing so locks them into equal proportional heights, creating ugly blank padding for short lists and clipping/hiding controls for long lists.
> - **Enable Natural Document Flow**: Override the flexbox constraints using `style="flex: none;"` on the containers so that they expand dynamically based on their actual database content.
> - **Unified Scrolling**: Ensure that the outer `.scroll-area` container handles scrolling for the entire layout as a single document rather than having nested, competing scroll regions.
> - **Floating Button Spacing**: Always ensure the bottom-most list container has enough bottom padding (e.g., `padding-bottom: 3rem;`) to comfortably clear any floating UI components (like the support/chat widget).

---

## 15. User-Friendly Error Messaging Policy
> [!IMPORTANT]
> **NO CRYPTIC OR RAW ERRORS IN THE UI**:
> Standard HTTP status codes, database constraint errors (e.g. `Update 409`, `duplicate key`, `code 23505`), or system stack traces must never be shown directly to the user in notifications, alerts, or toast messages.
> - **Always Translate Raw Errors**: Intercept raw database and fetch error codes and translate them to clear, friendly, and actionable instructions for the user (e.g., convert a 409 Conflict/23505 Unique Violation into `"An account with this name already exists"`).
> - **Actionable Design**: Ensure the error message explains *what* went wrong and *how* the user can fix it.

---

## 16. Non-Destructive Database Migrations
> [!CRITICAL]
> **PRESERVE USER DATA IN MIGRATIONS**:
> - **Apply SQL Through the Signed-In Supabase Browser**: Do not stop after creating a migration file. Apply every requested SQL migration through the browser-controlled, already authenticated Supabase SQL Editor, confirm that execution succeeds, and then verify the resulting schema or query behavior. Use the signed-in Chrome Supabase session when the in-app browser is not authenticated.
> Never use destructive `DROP TABLE IF EXISTS ... CASCADE;` statement patterns in migration files, especially for established dashboard tables (like `software_subscriptions`). 
> - **Always Use Safe Alterations**: Use `CREATE TABLE IF NOT EXISTS`, and add new columns or attributes using `ALTER TABLE public.<table_name> ADD COLUMN IF NOT EXISTS <column_name> <type>;` statements to preserve existing records and test data.
> - **Conditional Policy Updates**: Use `DO $$` PL/pgSQL blocks to conditionally check and create policies `IF NOT EXISTS` to prevent execution crashes when rerun.

---

## 17. Popover and Dropdown Menu Clipping Prevention
> [!IMPORTANT]
> When implementing absolute-positioned popup elements like popovers, dropdown lists, tooltips, or selector menus inside cards, boxes, or grid layout panes:
> - **Identify Overflow Constraints**: Shared card modules (e.g., `.wh-card`) or layouts often declare `overflow: hidden;` or `overflow: auto;`. This clips absolute-positioned child elements that expand beyond the parent container boundaries.
> - **Apply Local Overrides**: Always explicitly declare `overflow: visible;` (or `overflow: visible !important;`) on the card or parent box wrapper hosting the interactive toggle trigger and popup component. This ensures flyout selections pop outside layout boundaries without being clipped.

---

## 18. Clean URLs and Asset Path Resolving
> [!IMPORTANT]
> Because Vercel serves clean URLs without extensions (e.g. rewriting `/dashboard/marketing-logs/index.html` to `/dashboard/marketing-logs`), relative resource paths like `marketing-logs.css` or `marketing-logs.js` declared in HTML files will fail to resolve. The browser treats the active path context as `/dashboard/` instead of `/dashboard/marketing-logs/`.
> - **Always Use Root-Relative Absolute Paths**: For all stylesheet links, script tags, images, or custom assets loaded inside nested subdirectory modules, declare paths using a leading slash (e.g. `/dashboard/marketing-logs/marketing-logs.css` instead of `marketing-logs.css`). This guarantees paths resolve correctly regardless of URL rewrite structures.
> - **Correct CSS and JavaScript Paths When Creating Subpages**: Every time a subpage or nested clean route is created, audit and correct all `<link rel="stylesheet">` and `<script src>` paths for the new URL depth. Use root-relative paths that match the assets' actual repository locations, and verify each referenced file exists; never assume shared assets live under the subpage directory (for example, use `/css/style.css`, not `/dashboard/css/style.css`, when the file is stored at `css/style.css`).
> - **Sidebar Active State Must Follow Directory Changes**: Every time a dashboard route is added, renamed, moved into a subdirectory, or given nested subpages, verify that `js/sidebar.js` highlights the correct sidebar item and expands its parent group for every resulting URL. Nested routes must inherit the nearest matching sidebar page (for example, both `/dashboard/attendance-leaves/logs` and `/dashboard/attendance-leaves/settings` highlight `Attendance & Leaves`). Use longest-prefix matching or an explicit route-family alias where paths differ; never use a broad prefix that allows a shorter sibling such as `/dashboard/attendance` to steal the active state from `/dashboard/attendance-leaves`.
> - **Never Rewrite a Clean Route to an `.html` Destination**: When `vercel.json` has `"cleanUrls": true`, a rewrite such as `{"source":"/dashboard/booking-schedules/calendar","destination":"/dashboard/booking-schedules.html"}` can cause Vercel to redirect the internal `.html` destination back to its clean URL. If that clean URL also redirects to the source route, it creates a redirect/rewrite cycle that resolves as a production 404. Point rewrites to the clean destination instead: `{"source":"/dashboard/booking-schedules/calendar","destination":"/dashboard/booking-schedules"}`.
> - **Keep Redirects and Rewrites One-Way**: Redirects are only for legacy incoming URLs. Never use a redirect target as a rewrite source or point a rewrite destination to a route that redirects back to the original source. Before committing `vercel.json`, trace every changed route from public source to final static destination and confirm there is no cycle.
> - **Mandatory Pre-Deployment Route Audit**: Whenever `vercel.json`, a dashboard route, or a nested page is added or changed, validate all of the following before pushing:
>   1. `vercel.json` parses as valid JSON.
>   2. No rewrite destination ends in `.html` while `"cleanUrls": true`.
>   3. Every rewrite destination resolves to an existing static page or valid handler.
>   4. No redirect/rewrite pair forms a circular route.
>   5. Nested pages use root-relative asset URLs.
>   6. Every new or changed route highlights exactly one correct sidebar item and expands the correct sidebar group.
> - **Prefer Automated Route Validation**: If a route-validation script is available, it must run as part of the pre-deployment or CI checks and fail the deployment for `.html` rewrite destinations, missing targets, or redirect/rewrite cycles. Documentation review alone is not sufficient protection.
> - **Verify Production Routes After Deployment**: After changing redirects or rewrites, verify the deployed route directly and confirm it returns HTTP `200`, rather than assuming a valid `vercel.json` guarantees correct production routing.

---

## 19. Global Settings for Persistent Configurations & User Preferences
> [!IMPORTANT]
> Whenever implementing dashboard states, user selection filters, toggle switches, or preferences that need to be remembered across page loads and page refreshes:
> - **Never Use Local Storage**: Avoid `localStorage` or `sessionStorage` since preferences must synchronize across devices and platforms.
> - **Always Use `global_settings` Database Table**: Save and retrieve settings asynchronously using the `global_settings` table (scoped to `company_id` and identified by a unique `key`).
> - **Database Schema Pattern**:
>   * Read: Query the `global_settings` table for a specific `key` and retrieve the JSON value:
>     ```javascript
>     const { data } = await sb.from('global_settings').select('value').eq('key', 'your_settings_key').eq('company_id', companyId).maybeSingle();
>     ```
>   * Write: Perform a PostgREST `upsert` using the unique composite index constraint (`company_id, key`):
>     ```javascript
>     await sb.from('global_settings').upsert({
>       company_id: companyId,
>       key: 'your_settings_key',
>       value: { ...yourSettingsMap }
>     }, { onConflict: 'company_id,key' });
> ---

---

## 20. Proper Use of HTML Placeholder Attributes
> [!IMPORTANT]
> When rendering inputs or textareas with default placeholder text (such as "New Competitor", "Select option...", etc.):
> - **Use Placeholder Attributes**: Never set the default descriptive placeholder text as the actual database value or `value` attribute of the input. Doing so forces the user to manually highlight and delete the text when typing.
> - **Input Value Binding**: Always bind the value attribute to an empty string if the underlying record matches the default placeholder representation:
>   ```html
>   <input type="text" value="${record.name === 'New Record' ? '' : record.name}" placeholder="New Record" />
>   ```

---

## 21. Toast Notification Implementation Pattern
> [!IMPORTANT]
> When displaying notifications, success messages, or non-blocking alerts to the user inside dashboard pages:
> - **Never Call Undeclared Toast Functions**: Always verify if a `showToast()` function is declared locally in your script block before calling it.
> - **Toast Binding Standard**: Define `showToast()` locally to hook into `window.Toast` to prevent `ReferenceError: showToast is not defined` exceptions:
>   ```javascript
>   function showToast(message, isError = false) {
>     if (window.Toast) {
>       window.Toast.show(message, isError ? 'error' : 'success');
>     } else {
>       console.log((isError ? 'ERROR: ' : 'INFO: ') + message);
>     }
>   }
>   ```

---

## 22. Reusable Sitewide UI Components
> [!IMPORTANT]
> Elements repeated across multiple pages—such as public-site footers, headers,
> navigation, and dashboard sidebars—must have one shared implementation. Do not
> copy their complete HTML into every page.
>
> - **Use Lightweight Mount Points**: Each page should declare only the semantic
>   mount element required by the shared renderer. For the public-site footer:
>   ```html
>   <footer class="footer" data-unified-footer></footer>
>   <script src="/js/main.js"></script>
>   ```
> - **One Source of Truth**: Footer structure and links belong in the existing
>   unified footer component in `js/main.js` (exposed as
>   `window.BKUnifiedFooter`). Dashboard navigation belongs in `js/sidebar.js`.
>   Update the shared component once instead of creating page-specific copies.
> - **No Page-Specific Footer Markup**: New public pages, including listing and
>   detail routes, must not hardcode footer columns, links, branding, or copyright
>   rows. Use the shared footer mount even when the page initially needs only a
>   minimal footer.
> - **Keep Component Styling Shared**: Do not add page-specific footer CSS unless
>   the page has a documented layout requirement that cannot be expressed by the
>   shared component. Remove obsolete styles when duplicated markup is replaced.
> - **Verify the Rendered Component**: Test each new page after integration and
>   confirm the mount renders the shared structure, current year, expected links,
>   and no console errors.

---

## 23. Handle-Only Dragging for Reorderable Builders
> [!IMPORTANT]
> Reorderable form builders, list builders, and card editors that display a
> six-dot drag handle must start dragging **only from that handle**.
>
> - Never put `draggable="true"` on the complete card, row, question, or form
>   field. Doing so interferes with selecting text and using inputs, textareas,
>   dropdowns, buttons, and empty card space.
> - Put `draggable="true"` and the `dragstart` listener directly on the visible
>   drag-handle button.
> - The containing card may remain the drop target through `dragover` and `drop`
>   handlers, but it must not be a drag source.
> - Clear the active dragged-item state on `dragend`, including cancelled drags.
>
> ```html
> <article class="builder-item" ondragover="event.preventDefault()" ondrop="dropItem(event)">
>   <button class="drag-handle" type="button" draggable="true"
>     ondragstart="startItemDrag(event)" ondragend="endItemDrag()">
>     <!-- six-dot SVG -->
>   </button>
>   <!-- interactive builder fields -->
> </article>
> ```

---

## 24. Standard Email Logo Delivery (Inline CID)
> [!IMPORTANT]
> All system-generated emails, including HR Events and Hiring emails, must use
> the same company-scoped inline-logo implementation.
>
> - **Single Branding Source**: Read the logo from the `global_settings` record
>   whose key is `company_profile_config`, filtered by the active `company_id`.
>   Prefer `logoDark`, then fall back to `logoLight`.
> - **Use CID for Uploaded Logos**: Data-image logos must be decoded server-side
>   and attached to the email as an inline Content-ID (CID) image. Reference that
>   CID from the email HTML. Do not send a browser data URL, convert the logo to
>   styled text, or upload a new public copy for every message.
> - **Reuse the Shared Helper**: Use
>   `lib/api/email-branding.js` and its `buildEmailBranding()` result for the
>   rendered logo plus the provider-specific Nodemailer or Resend attachments.
>   Do not create another page-specific email-logo implementation.
> - **Safe Fallback**: If no valid uploaded image is available, render escaped
>   company-name text. Keep meaningful image alt text for supported logos.
> - **Selected Test Only**: A test-email action must send only the email type
>   currently selected in the UI, never every template in the set.

---

## 25. Installation Completion Month vs. Payout Cutoff
> [!CRITICAL]
> Installation completion and installation payout eligibility are related but
> distinct business facts:
>
> - Count an installer assignment as completed when its assigned door is marked
>   completed, or when the whole booking is marked `done`, `completed`, or
>   `finished`. This preserves valid legacy door-level completion records.
> - Attribute the completed count to the booking's `scheduled_date` calendar
>   month. Never move the completed count into the following month.
> - Use that same `scheduled_date` to determine the payout cutoff bucket.
> - Work dated after the month's final cutoff rolls into the first payout of the
>   next month, but remains a completion in its original installation month.
> - Scheduled assignments that are not Done do not count and do not roll over
>   until they are marked Done.
>
> Example: with July cutoffs on the 15th and 30th, a Done installation dated
> July 31 is included in July's completed installation count and paid in the
> first August cutoff. An unfinished July 31 assignment is included in neither
> completed counts nor payout.
