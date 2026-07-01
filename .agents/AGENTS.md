# Project-Specific Rules & Guidelines

> [!CRITICAL]
> **AGENT PROTOCOL**: Do NOT rely on your generic training data first to debug or write solutions. The solution or constraints for recurring problems are already documented in this file, `CLAUDE.md`, and `DESIGN.md`. Before proposing any code modifications, always search these files first to see how the problem was solved before.

## 1. Email Link Generation & Redirection Rules
- **Whitelisted Redirect URLs Only**: All authentication redirection links (invitations, password resets, signup verifications) must strictly match the whitelisted redirect URLs configured in the Supabase Dashboard:
  - Production: `https://brightkeysolutions.com/admin` (No `www.` prefix, no `.html` extension)
  - Local Dev: `http://localhost:3000/admin` (No `.html` extension)
- **Local Dev vs. Production Origin**:
  - Always default links to the production URL (`https://brightkeysolutions.com`) so that emails triggered by administrators from local environments do not send broken `localhost:3000` links to remote users.
  - Dynamically detect local testing environments by parsing the request referer:
    ```javascript
    let origin = 'https://brightkeysolutions.com';
    const referer = req.headers.referer || '';
    if (referer.includes('localhost') || referer.includes('127.0.0.1')) {
      origin = 'http://localhost:3000';
    }
    const redirectTo = `${origin}/admin`;
    ```
- **No File Extensions in Redirects**: Vercel serves clean URLs without extensions. Do not use `.html` in redirections (e.g., use `/admin` instead of `/admin.html`).

## 2. PDF Generation via html2pdf & html2canvas
- **Use Static off-screen wrappers**: When generating PDFs dynamically, do not create temporary elements programmatically in JavaScript and place them at negative coordinates (e.g., `left: -9999px`). Doing so causes `html2canvas` to render a blank/transparent page.
- **HTML Container Pattern**: Always define a static hidden wrapper container directly in the HTML structure with fixed print dimensions, for example:
  ```html
  <div id="payslip-hidden-wrapper" style="position: absolute; left: -9999px; top: -9999px; width: 210mm; height: 297mm; background: #fff;">
    <div id="payslip-a4-sheet"></div>
  </div>
  ```
  Inject the compiled HTML into the child element, generate the PDF, and then clear the container.

## 3. Dashboard Table Layout & Height Constraints
- **Local Container Constraints**: To keep tables from overflowing browser page bounds, always restrict table wrapper heights locally within the page's `<style>` block rather than modifying global files like `shared.css`.
- **Viewport Calc Auto-sizing**: Constrain the wrapper element (e.g., `#summary-table-container`) using a viewport-based calculation to keep horizontal and vertical scrollbars self-contained within the table:
  ```css
  #summary-table-container {
    max-height: calc(100vh - 240px);
    max-height: calc(100dvh - 240px);
    overflow: auto;
  }
  ```

## 4. HTML Syntax & Tag Validation (Anti-Overcomplication Policy)
- **First Action for Invisible/Misaligned Elements**: Whenever a UI element (such as a modal, button, card, or tab panel) is unexpectedly invisible, misaligned, or unresponsive:
  - **First Action**: Always check the HTML file structure first for unclosed, misplaced, or mismatched tags (especially unclosed `</div>` tags).
  - **No Complex Overrides First**: Do not construct complex CSS styles, transitions, custom JS reflows, or animations before verifying that the basic HTML DOM tree structure is 100% syntactically correct.

## 5. Dashboard Modal Implementation Patterns
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

## 6. Strict Database Schema Validation (Anti-Hallucination Policy)
- **Verify Database Schema Before Coding**: Never guess database column names, primary keys, or relationships when writing SQL queries or front-end data bindings. 
- **First Action**: Query the target table using a scratch script, check existing migrations, or check existing query files in the codebase (e.g. `booking-schedules.js`) to confirm exactly what fields are present.
- **Common Mismatches to Avoid**:
  * `installation_bookings` uses `scheduled_date` (NOT `schedule_date`).
  * `installation_bookings` uses `order_no` (NOT `booking_number`).
  * Currency fields are stored in centavos (integers) rather than decimals.
- Doing this check proactively prevents back-and-forth debugging from column mismatches and ensures immediate functionality.
