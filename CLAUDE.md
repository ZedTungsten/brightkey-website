# BrightKey Multi-Tenant ERP Security Architecture & Guidelines (`Claude.md`)

This document outlines the security architecture and guidelines designed to ensure that the BrightKey ERP system is secure, resilient to injection attacks, and isolated for multi-tenant execution.

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
  const authInfo = await window.BKAuth.checkRoleGate(['owner', 'admin'], '../admin.html');
  ```
  This guarantees that non-admin and non-tenant accounts are booted before the browser can fetch or draw sensitive forms.

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

## 9. Modal Overlay Activation (Opacity & Transitions)
> [!IMPORTANT]
> When opening or closing modal overlays (such as `.modal-overlay` styled elements), updating `.style.display = 'flex'/'none'` alone is NOT sufficient. The CSS rules hide the overlay by default using `opacity: 0` and `pointer-events: none` to support fade transitions.
>
> To correctly trigger modals:
> 1. **Open**: Show the display block/flex, trigger a browser reflow (e.g., read `offsetHeight`), and add the `.open` class.
>    ```javascript
>    modal.style.display = 'flex';
>    modal.offsetHeight; // force reflow
>    modal.classList.add('open');
>    ```
> 2. **Close**: Remove the `.open` class first to trigger the fadeout, then hide the display after the transition completes.
>    ```javascript
>    modal.classList.remove('open');
>    setTimeout(() => {
>      modal.style.display = 'none';
>    }, 150);
>    ```

---

## 10. Fetching Products (MANDATORY `id` Selection)
> [!IMPORTANT]
> When querying the `products` table from Supabase client (e.g. `sb.from('products').select(...)`), ALWAYS explicitly include the `id` column in the select fields list.
> 
> Failing to include `id` will result in `undefined` product IDs at runtime when performing product matching or querying dependent tables (like `qa_guides` or `inventory_transactions`), which triggers database UUID syntax errors: `invalid input syntax for type uuid: "undefined"`.

---

## 11. Saving PDF Files from On-Screen Preview HTML
When generating and saving high-fidelity A4/Letter PDF files from dynamic HTML preview components (e.g. Invoices, Receipts, Payslips) using client-side libraries like `html2pdf.js`, follow this off-screen rendering architecture:

### The Problem with On-Screen / Iframe Previews
1. **Layout Scaling**: Live preview panes often zoom/scale the page down (e.g., `transform: scale(0.6)`) to fit the dashboard layout. Rendering this element directly captures the scaled-down sizing, resulting in massive whitespace borders on the output PDF.
2. **Iframe Barriers**: Capturing elements from inside sandboxed iframes triggers stylesheet resolution failures, web font loading blocks, and cross-origin CORS limitations.
3. **CORS on Storage Assets**: External assets (like logos or signatures loaded from Supabase storage) trigger canvas taining blocks.

### The Solution: Parent DOM Off-Screen Rendering
1. **Base64 Asset Prefetching**: Convert dynamic external image URLs to Base64 data URIs during page initialization or payload fetch (e.g., using `FileReader` and `fetch`), bypassing CORS canvas taint blocks.
2. **Hidden Capture Container**: Place a hidden, unscaled container in the parent document body positioned off-screen (e.g., `left: -9999px`) styled at full 1:1 layout size (e.g., `width: 794px` for A4).
3. **Injected Print Flow**:
   * Copy the compiled HTML string containing the custom styles and Base64 assets into the hidden parent DOM element.
   * Run `html2pdf.js` directly on the off-screen parent target.
   * Instantly clear the container's contents in the `finally` block to keep the DOM clean.

---

## 12. Non-Destructive Database Migrations
> [!CRITICAL]
> **PRESERVE USER DATA IN MIGRATIONS**:
> Never use destructive `DROP TABLE IF EXISTS ... CASCADE;` statement patterns in migration files, especially for established dashboard tables (like `software_subscriptions`). 
> - **Always Use Safe Alterations**: Use `CREATE TABLE IF NOT EXISTS`, and add new columns or attributes using `ALTER TABLE public.<table_name> ADD COLUMN IF NOT EXISTS <column_name> <type>;` statements to preserve existing records and test data.
> - **Conditional Policy Updates**: Use `DO $$` PL/pgSQL blocks to conditionally check and create policies `IF NOT EXISTS` to prevent execution crashes when rerun.
