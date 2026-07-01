# BrightKey Multi-Tenant ERP Security Architecture & Guidelines (`AGENTS.md`)

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
