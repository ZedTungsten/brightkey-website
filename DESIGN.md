# UI/UX & Design Guidelines

Guidelines for styling, icons, modal alerts, and loading components to maintain visual consistency and performance.

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
/* ❌ This container sits at z-index: 99999 fixed on the page */
/* ❌ Even when empty, it can block scroll/hover on elements below */
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
