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

## 22. Optimization Must Preserve Business Visibility and Workflow Semantics
> [!CRITICAL]
> **AN OPTIMIZATION IS NOT ALLOWED TO CHANGE WHO OR WHAT A VALID TENANT USER CAN SEE**:
> Performance work may reduce payload size, query count, scan size, or render
> cost, but it must preserve the existing authorized result set, historical
> references, and workflow side effects. Treat visibility and downstream
> synchronization as part of the query contract.

### 22.1 Never Turn a Performance Filter into an Authorization Rule
- RLS and explicit `company_id`/tenant boundaries prevent cross-tenant access.
  Do not add role, department, creator, assignee, warehouse, or employee-self
  filters to shared tenant data unless the documented business rule explicitly
  requires that restriction.
- Do not change a tenant-wide employee/profile query into `id = current user`.
  Shared profiles, chat participants, schedules, rankings, assignments, and
  historical records must still resolve other employees in the same tenant.
- Do not treat failure to resolve a related row as permission to replace it with
  `"Unknown Employee"`, `"Unknown User"`, or a blank value. First determine
  whether the related-row query was incorrectly narrowed.
- A count optimization and its corresponding list query must use equivalent
  business predicates. A badge showing records that the list hides is a failed
  optimization.

### 22.2 Active-Only Filters Belong Only Where the Business Action Requires Them
- Login gates and new-assignment selectors may exclude inactive, fired, or
  resigned employees.
- Historical and relational views must still resolve those employees by name:
  past adjustments, payouts, schedules, sales, chat history, approvals,
  assignments, invoices, and audit records must not become anonymous when an
  employee becomes inactive.
- When a page needs both behaviors, retain a tenant-wide lookup map for display
  and derive a separate active-only collection for selectable options. Do not
  reuse the active-only collection as the historical name directory.
- Disabling login must be implemented at authentication/access gates. Do not
  achieve it by hiding the employee row from every tenant query.

### 22.3 SKU and Product Visibility Must Remain Tenant-Wide
- Do not filter the shared product/SKU catalog by the current employee, creator,
  department, or module role merely to reduce rows.
- Booking, invoice, warehouse, sales, and product selectors must resolve all
  tenant-authorized SKUs required by their records, including SKUs created by
  another user.
- Inventory-specific exclusions such as `count_inventory = false` may control
  warehouse stock workflows, but they must not remove the SKU from invoices,
  bookings, order history, or other non-inventory views.
- Retain stable identifiers required for joins and deduplication, especially
  `products.id`, `sku`, `company_id`, and relevant foreign keys.

### 22.4 Narrow Projections Must Include the Full Downstream Data Contract
- Before replacing `.select('*')` with a narrow projection, trace every consumer
  of the returned object, including helpers, background sync, rendering,
  sorting, grouping, fallback logic, and write-payload construction.
- Never select fields for only the first visible use. A background workflow may
  depend on fields read later in the same function.
- If code reads `booking.product_skus`, `booking.product_qtys`, or
  `booking.created_at`, those fields are mandatory in the booking projection
  even when they are not rendered directly.
- After narrowing a projection, search the complete call path for every
  `record.<field>` access and verify each field is still selected. Missing fields
  that silently produce empty arrays, skipped loops, blank labels, or omitted
  inserts are release-blocking defects.
- Prefer an explicit documented projection constant or typed mapper when the
  same record shape is shared across multiple modules.

### 22.5 Never Break Order-to-Workflow Handoffs
- Optimizations must preserve all state transitions and derived records across:
  booking/invoice → reserved transaction → Inspect → Pack → Dispatch → Receive.
- A booking or invoice being visible does not prove warehouse synchronization
  succeeded. Verify the expected `inventory_transactions` rows exist with the
  correct `company_id`, `warehouse_id`, `reference_id`, SKU, quantity, type, and
  status.
- Do not remove data needed to construct downstream writes. A loop that now
  receives an empty item collection without throwing is still a production
  failure.
- Repair scripts must be narrowly scoped and idempotent: use exact company and
  reference boundaries plus `NOT EXISTS`/conflict guards. Never recreate,
  overwrite, or advance existing transaction history during a backfill.

### 22.6 Required Before/After Regression Audit for Optimizations
For every optimization that changes database projections, filters, RLS policies,
shared loaders, lookup maps, or synchronization:

1. Record the expected pre-change result set and side effects for representative
   tenant data.
2. Test an active employee and an inactive employee referenced by historical
   data.
3. Test a regular user viewing another tenant member's profile/name, chat,
   schedule, ranking, and assignment where applicable.
4. Test SKUs created or managed by a different user in booking, invoice, sales,
   and warehouse contexts.
5. Create or use a production-shaped order and verify the complete workflow
   handoff, not just the originating booking/invoice screen.
6. Compare badges/counts with the records actually rendered by the destination
   page.
7. Confirm no valid same-tenant record changed to unknown, blank, missing, or
   inaccessible.
8. Confirm cross-tenant isolation still holds through RLS and explicit tenant
   filters.

### 22.7 Optimization Definition of Done
An optimization is incomplete unless:

- Authorized before/after result sets are equivalent.
- Historical identities remain resolvable after employee deactivation.
- Shared tenant SKUs remain visible in every required business module.
- Workflow-generated rows and status transitions still occur.
- Narrow projections cover every downstream field access.
- Count and detail queries agree.
- Production-shaped authenticated route tests pass for owner/admin and regular
  users.
- Any intentional visibility change is separately documented, explicitly
  approved, and tested as a product/security change rather than described as a
  performance optimization.

---

## 5.1 Database Query Performance & Disk IO Budget
> [!CRITICAL]
> **DATABASE EFFICIENCY IS A BUILD REQUIREMENT, NOT A LATER OPTIMIZATION TASK**:
> Every new dashboard feature must be designed so its normal page load remains
> bounded as the tenant's data grows. A query that is acceptable with test data
> but scans a complete operational table is not production-ready.

### 5.1.1 Never Run Operational Audits from Global Components
- Shared files such as `js/sidebar.js`, `js/auth.js`, navigation badges, headers,
  chat bootstrapping, and global layouts execute on many or every dashboard route.
- They must **not** load complete sets of bookings, products, transactions,
  attendance logs, commissions, or journal entries to calculate a badge or status.
- Run feature-specific audits only on the feature's own routes.
- Global badges must use a small company-scoped `count`, boolean RPC, cached
  summary row, or materialized summary. They must never reconstruct business
  state client-side from several operational tables.

```javascript
// Bad: runs on every dashboard route and downloads operational records.
const { data } = await sb
  .from('installation_bookings')
  .select('*')
  .eq('company_id', companyId);

// Good: feature-specific, bounded summary.
const { count } = await sb
  .from('installation_bookings')
  .select('id', { count: 'exact', head: true })
  .eq('company_id', companyId)
  .eq('status', 'needs_review');
```

### 5.1.2 Tenant Ownership Is Mandatory on Reads and Writes
- Resolve and validate `companyId` before issuing company-owned queries.
- Every read from a company-owned table must include the company boundary, even
  when RLS is enabled. RLS is the security boundary; the explicit filter is also
  the query-planning and performance boundary.
- Every insert or upsert into a company-owned table must explicitly write
  `company_id`. Never rely on a nullable default.
- New company-owned columns should be `NOT NULL` unless the absence of ownership
  is a documented business requirement.
- For existing tables, backfill ownership safely before adding `NOT NULL`.
- Compatibility filters such as `company_id.is.null` are temporary migration
  measures only. Do not introduce new null-owned records.

```javascript
if (!companyId || companyId === 'null') return;

await sb.from('inventory_transactions').insert({
  company_id: companyId,
  warehouse_id: warehouseId,
  sku,
  quantity,
  type: 'customer_order',
  status: 'reserved'
});
```

### 5.1.3 No Unbounded Collection Queries
- History, ledger, booking, review, attendance, and transaction queries must have
  server-side pagination or a strict bounded date window.
- Apply filtering and ordering before `.range()` or `.limit()`.
- Default list pages should normally request 50–100 rows. Larger limits require
  a documented reason and must still have a hard ceiling.
- Do not fetch 1,000–10,000 rows merely to filter, sort, count, or paginate them
  in JavaScript.
- Prefer keyset/cursor pagination for rapidly growing tables. Offset pagination
  is acceptable for smaller administrative lists.
- Date-based reports must include both a start and an end bound; never query
  “from the beginning of this month onward” without the month-end boundary.

```javascript
const { data, error } = await sb
  .from('inventory_transactions')
  .select('id, sku, quantity, status, created_at')
  .eq('company_id', companyId)
  .eq('warehouse_id', warehouseId)
  .gte('created_at', periodStart)
  .lt('created_at', periodEnd)
  .order('created_at', { ascending: false })
  .range(pageStart, pageEnd);
```

### 5.1.4 Select Only the Fields the View Uses
- Do not use `.select('*')` for tables containing large JSON, media, attachment,
  address, conversation, or audit fields.
- List screens must request a narrow projection.
- Load full details only after a user opens a specific record.
- `.select('*')` is permitted only for a justified single-record detail query
  where the view genuinely consumes nearly every field.
- Products queries must still include `id`, as required by Section 10.

### 5.1.5 Eliminate N+1 Database Requests
- Never place a Supabase read or write inside a loop when the operation can be
  expressed as one batch.
- Collect IDs/SKUs/reference numbers, fetch them with `.in(...)`, then construct
  an in-memory lookup map.
- Batch updates sharing the same value with `.in('id', ids)`.
- When several inventory counters must change atomically, use a database RPC or
  transaction rather than repeated client-side read/modify/write operations.
- Chunk unusually large ID lists into bounded batches.

### 5.1.6 Indexes Must Match Real Query Shapes
- Before adding an index, inspect the live schema and the actual query captured
  in `pg_stat_statements`.
- For composite indexes, put equality/tenant filters first, followed by range or
  ordering columns used by the query.
- Common examples:
  - `(company_id, status)`
  - `(company_id, scheduled_date)`
  - `(company_id, warehouse_id, created_at DESC)`
  - `(employee_id, created_at DESC)`
- Use `EXPLAIN` to confirm the intended index is chosen.
- Do not add speculative indexes. Indexes increase write IO, storage, vacuum
  work, and maintenance cost.
- Migrations must use non-destructive, rerunnable statements such as
  `CREATE INDEX IF NOT EXISTS`.

### 5.1.7 Cache and Refresh Deliberately
- Deduplicate identical requests within a page lifecycle by caching the active
  Promise or result in the module context.
- Refresh only after the underlying action changes data, when the active tenant
  changes, or at a documented low-frequency interval.
- Do not implement aggressive polling for sidebar status or counters.
- Persistent business configuration follows Section 19 and belongs in
  `global_settings`; do not misuse browser storage as a cross-page database cache.

### 5.1.8 Mandatory Pre-Deployment Query Audit
For any feature that adds or changes database access:

1. Inspect every touched live table with:
   `node scripts/db-inspect.js <table_name>`.
2. Search the changed files for:
   - `.select('*')`
   - database calls inside loops
   - missing `company_id` on inserts/upserts
   - collection queries without `.range()`, `.limit()`, or date bounds
   - shared/sidebar/auth code loading operational tables
3. Run targeted ESLint and syntax checks.
4. Load every affected dashboard route with realistic authenticated data.
5. Confirm loading states finish, existing records remain visible, and no raw
   database errors appear.
6. For high-frequency or high-volume paths, compare `pg_stat_statements` before
   and after deployment: calls, total time, mean time, shared blocks read/hit,
   and temporary blocks.
7. Review Supabase Database Health after a representative business cycle.

### 5.1.9 Definition of Done
A database-backed dashboard feature is not complete unless:

- Tenant ownership is written and filtered explicitly.
- Collection size is bounded on the server.
- Payload columns are intentionally selected.
- No avoidable N+1 access remains.
- Required composite indexes are verified against the real query.
- Global components do not perform feature-wide scans.
- The affected routes are tested with existing production-shaped data.
- Query growth remains proportional to the requested page/report, not to the
  tenant's complete lifetime dataset.

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
When creating tabs in BrightKey Portal dashboards, follow the tabs design from `/dashboard/fulfillment`:

### HTML Structure
```html
<div class="drawer-tabs">
  <button class="tab-btn active" onclick="switchTab('tab1')">Tab One</button>
  <button class="tab-btn" onclick="switchTab('tab2')">Tab Two</button>
  <button class="tab-btn" onclick="switchTab('tab3')">Tab Three</button>
</div>
```

### CSS Styling
Ensure the tabs container and buttons use the following premium styling tokens:
```css
/* ── Tab Container Bar ── */
.drawer-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  overflow-x: auto;
  background: var(--bg-surface);
}

/* ── Tab Buttons ── */
.tab-btn {
  padding: 0.9rem 1.25rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-muted);
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  transition: all 0.15s;
}

/* ── Active Tab Styling ── */
.tab-btn.active {
  color: var(--cyan-light);
  border-bottom-color: var(--cyan);
}

/* ── Hover State ── */
.tab-btn:hover:not(.active) {
  color: var(--text-secondary);
}
```

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
> Before modifying or writing any HTML, CSS, front-end JavaScript, layouts, modal animations, or stylesheet overrides, the agent **MUST read `/DESIGN.md` in its entirety**.
> 
> You are strictly forbidden from implementing custom scroll configurations, modal transitions, loading overlays, or sticky table columns/headers without verifying the established design systems and code blocks defined in `/DESIGN.md` first. Custom layouts must strictly conform to these patterns to prevent layout bugs.

---

## 11. HTML Syntax & Tag Validation (Anti-Overcomplication Policy)
> [!IMPORTANT]
> Whenever a UI element (like a modal, button, overlay, or panel) is unexpectedly invisible, misaligned, or unresponsive:
> - **First Action**: Always check the HTML file for missing, misplaced, or unclosed tags (specifically unclosed `</div>` tags).
> - **Never Overcomplicate**: Do not attempt complex CSS overrides, custom JavaScript frame-reflow logic, or transitions before confirming that the basic HTML DOM nesting structure is 100% syntactically correct.

---

## 12. Dashboard Modal Implementation Patterns
We use two distinct patterns for modal overlays. Do NOT mix them:

### Pattern A: Keyframe-based (Used in `/dashboard/team`)
- **CSS**: Overlay transitions instantly via `display: none` / `display: flex`. The card handles fading and sliding using a `@keyframes` animation.
  ```css
  .modal-overlay { display: none; position: fixed; inset: 0; z-index: 1000; align-items: center; justify-content: center; }
  .modal-overlay.open { display: flex; }
  .modal-card { background: var(--bg-surface); animation: modalSlide 0.2s forwards; }
  @keyframes modalSlide { from { transform: translateY(15px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  ```
- **JavaScript**: Toggling the `.open` class is sufficient. No inline styles or timeouts are required.
  ```javascript
  modal.classList.add('open');
  modal.classList.remove('open');
  ```

### Pattern B: Transition-based (Global Standard in `DESIGN.md`)
- **CSS**: Overlay is hidden by default using `opacity: 0` and `pointer-events: none` to support fade transitions.
- **JavaScript**: Requires setting the display, triggering reflow, and adding the class:
  ```javascript
  modal.style.display = 'flex';
  modal.offsetHeight; // reflow
  modal.classList.add('open');
  ```

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
