# Project-Specific Rules & Guidelines

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
