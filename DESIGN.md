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
