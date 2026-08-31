# UI/UX & Design Guidelines

Guidelines for styling, icons, modal alerts, and loading components to maintain visual consistency and performance.

## Exact Reference Reproduction Workflow

When a supplied UI reference must be matched exactly, visual similarity is not
enough. Reproduce both its component hierarchy and its styling contract.

1. Inspect the actual rendered state in the browser, including dynamically
   generated content, before choosing selectors or changing CSS.
2. Map the reference into explicit regions: section header, card boundary,
   columns, field groups, labels, values, actions, media, and responsive states.
3. Ensure each independently styled item has its own element and class. Never
   combine label/value pairs into strings such as `Door: Wood<br>Jamb: Wood` when
   the reference displays labels and values with different typography or gaps.
4. Correct HTML or renderer structure first, then apply component-scoped CSS.
   Avoid inline-style escalation, broad `!important` patches, and chains of
   increasingly specific overrides.
5. Preserve behavior while changing presentation. Existing controls, IDs,
   uploads, editing, authorization, and persisted data remain part of the design
   contract unless the user explicitly removes them.
6. Verify the same record and modal state in the user's requested signed-in
   browser. Compare hierarchy, spacing, typography, alignment, borders, media,
   and actions against the reference before declaring completion.

If repeated CSS adjustments do not close the visual gap, stop and inspect the
rendered markup. This is usually evidence of a structural mismatch, not a need
for another override.

---

## 1. UI Alerts & Confirmation Dialogs
* **Never use standard browser alert/confirm boxes** (`alert(...)` or `confirm(...)`). They block the main browser thread.
* **For Form Errors**: Highlight the invalid input fields directly in red (`borderColor = '#EF4444'`) and scroll them into view.
* **For Delete/Action Confirmations**: Use a styled overlay modal (matching the master-settings design) or toast notifications instead of native browser popups.

---

## 2. Icons & Decorative Elements
* **Always use inline SVG for icons.**
* **Never use emojis** as icons or decorative elements anywhere in the UI (HTML, template strings, or JS-generated markup).
* **Minimalist SVG Buttons**: When rendering inline SVG buttons (e.g. edit, delete, cancel), use minimalist SVGs without containers, borders, backgrounds, or default padding. Buttons wrapping these SVGs should be transparent and borderless.
* **Standard Row Actions**: Use a pencil SVG for edit actions and a trash-can SVG for delete/remove actions. Render the SVG only—do not place visible `Edit`, `Delete`, or `Remove` text inside compact table action buttons. Keep an `aria-label` and `title` on every icon-only button for accessibility, and color destructive trash actions with `var(--danger)`.

---

## 3. CSS & Styling Override Check
* When modifying CSS styles (like `padding`, `margin`, `display`) in HTML/CSS files, **always double-check** if there is inline JavaScript dynamically updating the same elements via `element.style.property`.
* JS layout updates will aggressively overwrite stylesheet rules at runtime.

---

## 4. Skeletal & Loading States
* **Always show skeletal loading states** during page load or async data fetching.
* Avoid leaving containers completely blank or with raw text placeholders.
* Render a CSS-shimmering gradient skeleton that matches the layout of the incoming data, transitioning smoothly when loaded.

---

## 5. Input Fields & Dark Mode Behavior
* **Important internal form fields (like those in payment accounts management)** must remain solid white with dark text (`#09090B`) and readable dark-gray placeholders.
* They should **not** dynamically adapt to user/system dark mode preferences, preventing contrast issues and ensuring consistent visual clarity.
* **Form control text uses regular weight (`font-weight: 400`) by default**, including readonly, prefilled, date, file, text, select, and textarea values. Do not let a bold parent label cascade into its input value; set the control weight explicitly. Reserve medium or bold weights for labels, headings, and deliberate emphasis.
* **Required fields use a red asterisk immediately after the field label** (for example, `Date of Birth <span class="required">*</span>`). Do not render a separate `Required` word above or below the control. Preserve the native `required` attribute and accessible validation behavior; the asterisk is only the visual indicator.

---

## 6. Static Site Generation (SSG) for Product Pages
* **Never edit product HTML files (e.g. `products/*.html`) directly.** 
* Product pages are dynamically generated at build time using the template `dashboard/product-preview.html` and the generator script `scripts/build-products.js`.
* Any layout, CSS, or JS changes intended for product pages must be applied to `dashboard/product-preview.html` (for general structure/styles/scripts) and/or `scripts/build-products.js` (for dynamically injected tables/components). Re-run `npm run build` locally to test your updates before pushing.

---

## 7. macOS Trackpad Scroll in Custom Scroll Containers

**Problem:** On macOS with a trackpad, scroll gestures may not work when the cursor is hovering over the *empty space* inside a scroll container (e.g. below the last table row). The browser's scroll-target heuristic picks the element directly under the pointer — if that element isn't the scroll container itself (e.g. the `<table>` is shorter than the container), scroll events fall through to the page body instead.

**Fix Pattern — always apply these rules to any custom scroll container & table:**
```css
/* The scroll container */
.table-scroll {
  overflow: auto;
  overscroll-behavior: contain; /* prevents scroll bleeding out to the page */
}

/* The content inside the scroll container */
table {
  min-height: 100%; /* ensures the table always fills the container so the pointer always hits it */
}

/* Set row height to minimum so browser does not expand entries to fill empty space */
tbody tr {
  height: 1px;
}
```

**To prevent rows stretching when there are few table entries**, always append a transparent auto-height spacer row at the end of the `tbody`:
```html
<tr class="table-spacer-row" style="height: auto; border: none; background: transparent !important;"><td colspan="[TOTAL_COLUMNS]" style="padding: 0; border: none; background: transparent !important; pointer-events: none;"></td></tr>
```
And style the spacer row in CSS:
```css
tr.table-spacer-row,
tr.table-spacer-row:hover {
  background: transparent !important;
  border: none !important;
  pointer-events: none !important;
}
tr.table-spacer-row td {
  border: none !important;
  pointer-events: none !important;
  padding: 0 !important;
}
```

**For drawers / side panels**, also add to the inner body:
```css
.drawer-body {
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

### Page-Embedded Viewers Must Not Trap Vertical Scrolling

Document, image, PDF, report, and template previews embedded in a normally
scrolling page must leave vertical wheel and trackpad gestures to the page,
even while the pointer is over the viewer. The viewer may own horizontal
overflow for wide content, but it must not become a competing vertical scroll
container.

```css
.page-viewer {
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
}
```

Do not use `overflow: auto` or `overscroll-behavior: contain` on this kind of
viewer. Those declarations capture vertical gestures and make the surrounding
page appear stuck. This rule is different from a deliberately fixed-height
table, drawer, or modal body whose contents are explicitly intended to scroll
inside their own region.

### Every New Table Must Declare Its Scroll Owner

Before creating a table, decide and document which element owns vertical
scrolling. A page-flow table must leave vertical wheel and trackpad gestures to
the page: its wrapper may use `overflow-x: auto`, but must use
`overflow-y: hidden` and `overscroll-behavior-x: contain` instead of the
two-axis `overflow: auto` / `overscroll-behavior: contain` combination. A
viewport-contained table may own vertical scrolling only when the complete
height chain is constrained with `min-height: 0` as described below. Test by
scrolling while the pointer is over both a populated row and empty table space;
the chosen scroll owner must move and no gesture may appear locked.

**Bonus — prevent page jump on drawer open/close:** Save and restore the scroll container's `scrollTop` around the close transition, since removing a `position: fixed` overlay can trigger a layout reflow that resets scroll position:
```js
function closeDrawer() {
  const ts = document.querySelector('.table-scroll');
  const savedScroll = ts ? ts.scrollTop : 0;
  // ... remove open classes ...
  if (ts) requestAnimationFrame(() => { ts.scrollTop = savedScroll; });
}
```

---

## 8. Fixed/Positioned Overlay Elements Must Not Block Pointer Events

**Rule: Any `position: fixed` or `position: absolute` element that is always present in the DOM (e.g. toast containers, notification wrappers, badge overlays) MUST have `pointer-events: none`.**

**Why:** Even visually empty fixed elements intercept mouse events — including scroll gestures (especially on macOS trackpad) and hover detection — across whatever area of the viewport they occupy. At high `z-index` values, this silently breaks scrolling and `:hover` on everything underneath, which is extremely hard to debug.

**Always do this for persistent overlay containers:**
```css
#toast-container,
.notification-wrapper,
.overlay-badge-container {
  pointer-events: none; /* container never blocks interaction */
}

/* Individual interactive children re-enable as needed */
.toast.clickable,
.notification-item {
  pointer-events: auto;
}
```

**What NOT to do:**
```css
/* Bad: This container sits at z-index: 99999 fixed on the page */
/* Bad: Even when empty, it can block scroll/hover on elements below */
#toast-container {
  position: fixed;
  top: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 99999;
  /* missing pointer-events: none — OBSTRUCTIVE */
}
```

---

## 9. Loading States for Table Entries

* **Always include animation loading for all data loading for table entries.**
* **Loading indicator style**: A clean circle animation going around, styled in cyan blue (`var(--cyan)`).
* **Implementation pattern**: Wrap the circular spinner inside a centered flex layout container (`.loading-wrapper` with a `.spinner-cyan` child) in the table `<tbody>` row:
  ```css
  .spinner-cyan {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(6, 182, 212, 0.15);
    border-top-color: var(--cyan);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
  }
  .loading-wrapper {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2.5rem 0;
    color: var(--text-muted);
    font-size: 0.82rem;
    font-weight: 600;
  }
  ```
  ```

---

## 10. Sticky Table Headers & Horizontal Scroll in Cards/Panels

**Problem:** When a table is wrapped in a card/panel (`.panel`) that features a top header with buttons/actions (`.panel-header`), we want:
1. The table contents to scroll horizontally when screen width is small (without overflow spilling out of the panel border).
2. The header/actions (`.panel-header`) to remain full-width and completely stationary (not scroll horizontally with the table).
3. The vertical sticky header (`thead th` with `position: sticky; top: 0;`) to still function properly when scrolling vertically inside the card.

If you simply wrap the table in `overflow-x: auto`, it creates a horizontal scrolling container which intercepts the sticky vertical header's scroll context, breaking its vertical stickiness.

**Fix Pattern — Flex Column Panel with nested `.table-responsive`:**
Instead of scrolling the whole panel, restrict vertical and horizontal scrolling specifically to the table wrapper:

1. **The Panel Container (`.panel`)**: Style it as a full-height flex column with hidden overflow:
```css
.panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  position: relative;
  
  /* Flexbox settings to constrain table scrolling */
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

2. **The Panel Header (`.panel-header`)**: Ensure it doesn't shrink and remains stationary:
```css
.panel-header {
  /* ... padding, backgrounds, borders ... */
  flex-shrink: 0; /* Prevents header compression */
}
```

3. **The Table Wrapper (`.table-responsive`)**: Wrap the `table` inside a `flex: 1; overflow: auto;` container:
```css
.table-responsive {
  flex: 1;
  overflow: auto; /* Handles both horizontal and vertical scrolling context */
  overscroll-behavior: contain;
}
```

4. **HTML Structure:**
```html
<div class="panel">
  <div class="panel-header">
    <span>Warehouse Tally</span>
    <button>Edit Stocks</button>
  </div>
  <div class="table-responsive">
    <table>
      <thead>
        <tr>
          <th>SKU</th>
          <!-- ... -->
        </tr>
      </thead>
      <tbody>
        <!-- ... -->
      </tbody>
    </table>
  </div>
</div>
```

### CS Customers-Style Tables Must Stay Within the Viewport

The CS Customers table pattern is a short, viewport-contained panel. The page
header and toolbar remain visible while only the table wrapper scrolls. Do not
allow the table rows to increase the document height.

Setting `overflow: auto` on the table wrapper is not enough. Flex children use
`min-height: auto` by default, so an unconstrained ancestor refuses to shrink
below the table's content height. This makes the panel and page grow with every
row instead of creating an internal scrollbar.

Constrain the complete height chain:

```css
.dashboard-page,
.dash-main {
  height: 100vh; /* fallback */
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
}

.content-area,
.main-panel,
.page-content,
.table-panel {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.table-toolbar,
.panel-header {
  flex-shrink: 0;
}

.table-responsive {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
}

/* Reserve space outside the panel for the persistent Chat tab. */
.table-page-content {
  padding-bottom: 4rem;
}
```

Required behavior:

1. The root dashboard layout has a fixed viewport height, not only
   `min-height: 100dvh`.
2. Every flex ancestor between the viewport and table wrapper has
   `min-height: 0`.
3. Page-level ancestors use `overflow: hidden`; the table wrapper is the only
   vertical scrolling region.
4. Headers and toolbars use `flex-shrink: 0` so the table receives only the
   remaining height.
5. Reserve at least `4rem` of bottom padding outside the table panel when the
   page includes the persistent Chat tab or another floating bottom action.
   The widget must occupy this clearance instead of covering the table border,
   scrollbar, or final visible row.
6. Verify with enough rows to overflow: the page must remain stationary, the
   panel bottom must stay visible, and scrolling over the rows must move only
   the table contents. Confirm that the floating Chat tab does not overlap the
   table at the bottom of the viewport.

If the table still grows beyond the viewport, inspect the ancestor chain first.
Do not compensate with a guessed pixel `max-height`; a missing `min-height: 0`
or fixed viewport height is usually the cause.

### Sticky Headers Must Use Opaque Backgrounds

**Rule:** Every sticky table header cell must have a fully opaque background color. Never use `rgba(...)`, `hsla(...)`, `opacity`, or another translucent background on a `position: sticky` header cell.

**Why:** Scrolling table rows pass underneath sticky headers. A translucent header allows row values and borders behind it to show through, making text appear doubled or visually misaligned.

For tinted column headers, use an opaque near-white hex value:
```css
/* Correct: opaque tinted sticky headers */
thead th.price-dealer {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #FEF1F1;
}

thead th.price-install {
  position: sticky;
  top: 0;
  z-index: 5;
  background: #ECFAFC;
}

/* Incorrect: content underneath will bleed through */
thead th.price-dealer {
  background: rgba(239, 68, 68, 0.075);
}
```

Translucent colors may still be used for non-sticky body cells. When creating a tinted sticky header, convert the intended tint to its opaque composited hex equivalent and retain a sufficient `z-index`.

---

## 11. Mobile-First Architecture (with Sidebar in Consideration)
* **Always design for mobile first.**
* When designing layout overrides, ensure that mobile viewports do not render collapsed or minimized sidebar states. The mobile drawer menu must always render in its fully-expanded state (or remain completely hidden off-screen) for optimal usability and premium experience.

---

## 12. Dynamic Viewport Heights on Mobile (100dvh)
* **Problem**: Standard `100vh` or `height: 100vh` on mobile viewports (e.g., iOS Chrome/Safari) includes the dynamic address bar and native browser navigation bars. This makes the layout taller than the actual visible area, causing bottom buttons or indicators to be clipped or covered.
* **Rule**: Always use `100dvh` (Dynamic Viewport Height) for full-screen layout wrappers and fixed overlays on mobile:
  ```css
  .element {
    min-height: 100vh; /* fallback */
    min-height: 100dvh;
  }
  ```
  Or for elements that should span exactly the viewport height without scrolling:
  ```css
  .element {
    height: 100vh; /* fallback */
    height: 100dvh;
  }
  ```
* Ensure that media query overrides (e.g., `@media (max-width: 768px)`) do not inadvertently override the root layout container's `min-height: 100dvh` with a standard `100vh` declaration.

---

## 13. Dropdown Select Placeholder Behavior
* **Rule**: When using `<select>` dropdown menus with a default placeholder choice (e.g. `Hour`, `Min`, `AM/PM`), always mark the placeholder `<option>` as `disabled` and `hidden` (with optional `selected` attribute dynamically bound when no value exists).
* **Why**: This displays the placeholder text when no selection has been made, but prevents it from appearing as a selectable option in the list once the user opens the dropdown.
* **Example**:
  ```html
  <select>
    <option value="" disabled selected hidden>AM/PM</option>
    <option value="AM">AM</option>
    <option value="PM">PM</option>
  </select>
  ```

### Select Text Clipping Checks

When making a native `<select>` compact, do not combine a fixed height with
vertical padding unless the complete computed text line still fits. Prefer
`min-height` plus `height: auto`, an explicit readable `line-height`, and
`box-sizing: border-box`.

Before completing a select styling change, verify:

1. The selected text is fully visible at rest and is not clipped at the top or bottom.
2. The longest option remains readable without overlapping the native arrow.
3. The control remains vertically centered at desktop and mobile widths.
4. Shared `.form-select` padding, line-height, and appearance rules do not conflict with local height overrides.


---

## 14. Sticky Columns in `border-collapse: collapse` Tables

**Problem:** When a table uses `border-collapse: collapse` (the browser default), both `border-right` and `box-shadow` on `position: sticky` cells are unreliable:

- `border-right` is **merged/swallowed** by the adjacent cell's left border — so dividers between sticky columns disappear.
- `box-shadow` on the sticky cell itself is **clipped** by the table's stacking context and does not visually overflow into the scrolling area.

This means the typical approach of adding `border-right` and `box-shadow` to a sticky `<td>` or `<th>` produces no visible result once the table is scrolled.

**Fix Pattern:**

1. **Column dividers** — use **inset `box-shadow`** instead of `border-right`. An inset shadow paints *inside* the cell's own box and is not subject to border collapsing:
   ```css
   .col-num,
   .col-first-name,
   .col-middle-name {
     box-shadow: inset -1px 0 0 var(--border);
   }
   ```

2. **Right-edge shadow** (depth effect after the last sticky column) — use a **`::after` pseudo-element** positioned absolutely to the right of the cell. Because it is absolutely placed, it renders *over* the scrolling content instead of being contained in the table's stacking context:
   ```css
   .col-last-name {
     /* stronger divider on the final sticky column */
     box-shadow: inset -1.5px 0 0 var(--border-hover);
   }

   .dir-table th.col-last-name::after,
   .dir-table td.col-last-name::after {
     content: '';
     position: absolute;
     top: 0;
     right: -10px;    /* hangs outside the cell into the scroll area */
     width: 10px;
     height: 100%;
     background: linear-gradient(to right, rgba(0,0,0,0.08), transparent);
     pointer-events: none;
     z-index: 1;
   }
   ```

**Prerequisites:**
- The sticky cells must have `position: relative` (or `sticky`) so that `::after` is positioned relative to them. Ensure `position: relative` is set on all `th` and `td` in the table.
- The scroll container must **not** have `overflow: hidden` in the axis where the `::after` shadow should be visible (otherwise it gets clipped). `overflow-x: auto` is fine.

**What NOT to do:**
```css
/* These do NOT work with border-collapse: collapse on sticky cells */
.col-last-name {
  border-right: 2px solid var(--border);   /* swallowed by border collapsing */
  box-shadow: 4px 0 8px rgba(0,0,0,0.1);  /* clipped by table stacking context */
}
```

---

## 15. Toggle Switch (On/Off Pill)

* **Rule**: When implementing on/off settings or state controls, use a rounded pill toggle switch instead of standard checkboxes to ensure a premium, unified dashboard design.
* **HTML Structure**:
  ```html
  <label class="toggle-switch">
    <input type="checkbox" onchange="..." />
    <span class="toggle-slider"></span>
  </label>
  ```
* **CSS Styling**:
  ```css
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
  }
  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .toggle-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: var(--border);
    transition: .3s;
    border-radius: 24px;
  }
  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: #fff;
    transition: .3s;
    border-radius: 50%;
  }
  input:checked + .toggle-slider {
    background-color: var(--cyan);
  }
  input:checked + .toggle-slider:before {
    transform: translateX(20px);
  }
  ```

---

## 16. Modal Overlay Activation (Opacity & Transitions)

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

## 17. Color Standardization for Action Controls & Buttons

* **Danger / Delete / Destructive / Negative Actions**:
  * Always use **red** color styling for action buttons and SVGs (e.g. `color: var(--danger) !important;` or direct red color tokens) to signal risk or irreversible changes.
* **Confirm / Good / Proceed / Positive Actions**:
  * Always use **green** color styling for action buttons and SVGs (e.g. `color: var(--success) !important;` or direct green color tokens) to signal validation, creation, or confirmation success.

---

## 18. HTML Viewer to PDF Generation

> [!CRITICAL]
> Generate production PDFs from HTML viewers with authenticated server-side
> Chromium and Puppeteer's native `page.pdf()`. The reference implementation is
> `api/hr-contract-pdf.js`. Do not use `html2canvas`, `html2pdf`, jsPDF image
> capture, hidden iframes, off-screen capture containers, or browser print dialogs
> for a downloadable production PDF unless the user explicitly requires a legacy
> client-only workflow.

Rules:

- Reuse the viewer's semantic HTML and print CSS so preview and PDF share one
  layout source. Do not screenshot or rasterize the viewer.
- Render each document page at its physical size. For A4 use `210mm × 297mm`,
  `@page { size: A4; margin: 0; }`, explicit page breaks, and
  `preferCSSPageSize: true` with `printBackground: true`.
- Wait for network assets and `document.fonts.ready` before calling `page.pdf()`.
  Text and SVG output should remain vector-sharp; do not introduce arbitrary
  1.25×/2× canvas quality settings.
- Generate on the server without inserting or scanning pages in the user's
  visible/off-screen browser DOM. One click must produce one file download.
- Protect the endpoint with the caller's bearer token, existing RLS, company
  scope, and the route's required module/role gate. Prefer an authenticated
  Supabase client when the operation only reads data the caller may already read;
  do not require a service-role secret unnecessarily.
- Sanitize submitted HTML, disable page JavaScript, bound pages and payload size,
  and verify the requested record belongs to the authenticated company.
- Deduplicate repeated Base64 logos/signatures in the client payload and restore
  them server-side before rendering. Do not lower asset quality merely to fit the
  request limit.
- Use `puppeteer-core` with `@sparticuz/chromium-min` in the runtime. Build the
  hosted Chromium pack from `@sparticuz/chromium` during `postinstall`; do not
  bundle the full development package into the function.
- Select Chromium by actual platform: installed Chrome (or
  `CHROME_EXECUTABLE_PATH`) for local macOS/Windows development, and the packaged
  Linux binary only in Vercel's Linux runtime. `VERCEL=1` alone does not prove the
  process is running on Linux because `vercel dev` also sets it locally.
- Any function assets must be declared through a valid Vercel `includeFiles`
  string/glob, never an array. Confirm `vercel dev` accepts the configuration.
- Verify both environments: render a local PDF, inspect its page count/size and
  rasterized pages, then test the authenticated deployed endpoint and download on
  the live site. A local render alone is not proof that the Chromium pack URL,
  environment variables, function timeout, memory, or bundled CSS work live.

---

## 19. Search Bar Standard

All website and dashboard search fields must use a shared search component from
`css/style.css`. Use `.bk-search-field` when the markup can contain a wrapper
and inline SVG. Use `.bk-search-control` directly on compact toolbar, modal, or
dynamically generated search inputs. Do not create page-specific search colors,
corner radii, focus states, or icon implementations.

- Use a white background.
- Use a fully rounded pill shape (`border-radius: 999px`).
- Place a gray magnifying-glass SVG at the left of the input.
- Keep input text at normal font weight.
- Preserve consistent icon spacing with left input padding.
- Use the shared cyan focus border and focus ring.
- Existing IDs, event handlers, filtering behavior, and accessible labels must
  remain unchanged when adopting the shared style.
- Search inputs must use `type="search"`; do not style an ordinary text input as
  a search field.
- Do not substitute emoji, text glyphs, or browser-specific search icons for the
  SVG.

```html
<div class="bk-search-field">
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle>
    <line x1="16.5" y1="16.5" x2="21" y2="21"></line>
  </svg>
  <input type="search" placeholder="Search..." />
</div>
```

For a compact or dynamically generated search input:

```html
<input class="bk-search-control" type="search" placeholder="Search..." />
```

---

## 20. Form Back / Refresh Guard for Unsaved Changes

> [!CRITICAL]
> When a form or edit-mode page must protect unsaved changes, use the exact
> Employee Directory guard pattern in
> `dashboard/employee-directory-unsaved-guard.js`. Do not substitute a guard
> that is armed only after ordinary form bookkeeping or only during unload.

Required behavior:

- Install a same-document history boundary with `history.pushState()` as soon
  as the page guard is initialized. Do not wait for the first field change.
- Arm the guard again when edit mode opens. Repeated calls must be idempotent so
  they do not create multiple guard entries.
- Detect edits independently in capture-phase `input` and `change` listeners
  (`addEventListener(..., true)`). Scope these listeners to the page's editable
  controls and set an internal dirty flag before later renderer/form handlers
  run.
- Treat the internal dirty flag plus the page's pending update/delete state as
  authoritative. Do not make protection depend solely on a visual edit-mode
  class or toggle remaining active.
- On browser Back (`popstate`), restore the history boundary immediately and
  show the page's styled Unsaved Changes modal. The actions are:
  - **Cancel**: close the modal and remain on the form with edits intact.
  - **Save Changes**: await the existing save routine; leave only when the
    complete save succeeds. If any item fails, keep the modal/page available and
    preserve the remaining unsaved edits.
- Intercept ordinary same-tab page links in the capture phase while dirty and
  use the same Cancel / Save Changes modal. After a successful save, replace the
  temporary guard history entry when navigating so returning to the form does
  not require pressing Back twice.
- Add `beforeunload` while dirty for Refresh, tab/window close, direct address
  navigation, and browser-controlled cross-document navigation. Browsers require
  their native generic confirmation for this event; custom text, custom button
  labels, and asynchronous Save Changes actions are not available there.
- Set an explicit allow-unload flag only after a successful save-before-leave
  action so the intended navigation does not trigger a second warning.
- On a normal successful save or confirmed discard, clear the internal dirty
  flag and release the temporary history boundary without navigating away.
- Keep the guard in a route-specific JavaScript module when the main page module
  is near its size limit. Load it before the page module and cache-bust both
  scripts when their integration changes.

Verification required before completion:

1. Enter edit mode, change a field, press Back, and confirm the custom modal
   appears without leaving the page.
2. Choose Cancel and confirm all edits remain.
3. Repeat, choose Save Changes, and confirm navigation occurs only after the
   save succeeds.
4. Simulate a failed/partial save and confirm the page does not leave.
5. Change a field and click a same-tab sidebar/page link; confirm the same modal
   and save-before-leave behavior.
6. Change a field and refresh/close; confirm the browser's native unsaved-change
   warning appears.
7. Save or discard normally, then verify Back and Refresh no longer warn.

Do not use `alert()`, `confirm()`, or `prompt()` for the custom Back/link flow.
The native `beforeunload` dialog is the only exception because browser security
rules do not permit replacing it with an application modal.

---

## 21. Desktop Dashboard Sidebar Behavior

The dashboard sidebar is minimized by default on desktop and expands on pointer
hover. Expansion must overlay the page rather than changing the dashboard grid
or pushing page content horizontally.

- Desktop layout always reserves a 64px sidebar column.
- The expanded sidebar is 240px wide with a right-side shadow and higher
  stacking order.
- Pointer entry expands it; pointer exit minimizes it again.
- Do not persist desktop minimized state in browser storage or database settings;
  this is fixed navigation behavior, not a user preference.
- Mobile remains a fully expanded off-canvas drawer and must not inherit desktop
  minimized or hover-expanded classes.
- Sidebar expansion must not change the main content width, table scroll
  position, or page layout.

---

## 22. Page Header Tab Terminology

When a request refers to the **Page Header Tab**, it means the topmost
application header row containing the page name, such as `Sales Goals`. It does
not mean the content heading, the drawer/navigation tabs below the header, or a
section toolbar.

Actions requested for the right side of the Page Header Tab belong in that
topmost header row, aligned opposite the page name. Route-specific actions must
remain hidden on sibling routes that share the same HTML shell.
