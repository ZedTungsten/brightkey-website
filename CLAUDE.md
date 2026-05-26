# Project AI Guidelines

## Supabase Initialization Rule
**JavaScript Rule**: The Supabase client is globally initialized as `const sb = window.supabase.createClient(...)` inside `js/auth.js`. 
Because `auth.js` is included on every page that requires authentication or database access, `sb` is globally available. 

- **NEVER** redeclare `const sb` in any inline scripts or other JS files included on the same page. Doing so will cause a fatal `SyntaxError: Identifier 'sb' has already been declared`.
- **ALWAYS** just use the existing `sb` variable directly for all queries (e.g., `await sb.from(...)`).

## CSS & Styling Modifications Rule
**Javascript Override Check**: Whenever modifying CSS styles (like `padding`, `margin`, `display` etc.) for a specific element in the HTML or CSS files, **always** double-check if there is any inline Javascript (e.g., event listeners, UI interactions like `switchMedia()`) that aggressively overrides those same styles via `element.style.property`. 

- Many UI state switches in this codebase manually reset inline styles.
- Failing to check the Javascript logic will result in the CSS modifications seemingly "not working" because they are immediately overwritten by JS at runtime.
