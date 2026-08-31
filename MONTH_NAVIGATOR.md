# Canonical Month Navigator

This document preserves the month navigator used on
`/dashboard/ar-ap/customers` as the reference design for future dashboard-wide
standardization.

## Visual contract

- Placement: right side of the page heading, opposite the title and subtitle.
- Container: horizontal flex row with vertically centered contents.
- Surface: `var(--bg-surface)` (rendered white).
- Border: `1px solid var(--border)`.
- Radius: `var(--radius-md)` (rendered as `12px`).
- Shadow: `var(--shadow-sm)` (rendered as `0 1px 2px rgba(0, 0, 0, 0.05)`).
- Desktop rendered size with `August 2026`: approximately `215px × 43px`.
- Previous/next buttons: `42px × 42px`, transparent background, no border.
- Button icon: inline SVG chevron, `18px × 18px`, `fill: none`,
  `stroke: currentColor`, and `stroke-width: 2`.
- Default button color: `var(--text-secondary)`.
- Button hover: `var(--cyan-light)` text/icon on `var(--bg-elevated)`.
- Month label: minimum width `130px`, centered, `0.9rem`, weight `700`.
- Typography: Commissioner through the dashboard font stack.
- There are no text glyph arrows, emoji icons, internal dividers, or separate
  borders around the arrow buttons.

## Canonical markup

```html
<div class="month-picker" aria-label="Installation month">
  <button type="button" aria-label="Previous month">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m15 18-6-6 6-6"></path>
    </svg>
  </button>
  <span>August 2026</span>
  <button type="button" aria-label="Next month">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6"></path>
    </svg>
  </button>
</div>
```

IDs and event bindings may remain route-specific. Preserve the structure,
accessible labels, and inline SVG paths.

## Canonical CSS

```css
.month-picker {
  display: flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  box-shadow: var(--shadow-sm);
}

.month-picker button {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 0;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.month-picker button:hover {
  color: var(--cyan-light);
  background: var(--bg-elevated);
}

.month-picker svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}

.month-picker span {
  min-width: 130px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 700;
}
```

## Heading placement

```css
.page-heading-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
```

The navigator belongs inside the heading row as the second child. Do not
position it with absolute coordinates.

## Mobile behavior

At `700px` and below, stack the heading and make the navigator fill the
available width while keeping the controls evenly separated:

```css
@media (max-width: 700px) {
  .page-heading-row {
    flex-direction: column;
  }

  .month-picker {
    align-self: stretch;
    justify-content: space-between;
  }
}
```

## Future rollout checklist

1. Preserve each page's existing month state, URL/hash behavior, loading state,
   and previous/next event handlers.
2. Replace text arrows with the canonical inline SVG chevrons.
3. Place the navigator on the right side of the page heading on desktop.
4. Apply the documented full-width stacked layout on mobile.
5. Verify the longest localized month label fits without shifting button sizes.
6. Test previous and next navigation, disabled states when applicable, keyboard
   focus, and responsive layout before removing route-specific styles.

Reference implementation:

- `dashboard/ar-ap/customers/index.html`
- `css/receivables-customers.css`
