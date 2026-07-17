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
> Never guess database column names, primary keys, or relationships when writing SQL queries or front-end data bindings. 
> - **First Action**: Query the target table using a scratch script, check existing migrations, or check existing query files in the codebase (e.g. `booking-schedules.js`) to confirm exactly what fields are present.
> - **Common Mismatches to Avoid**:
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
