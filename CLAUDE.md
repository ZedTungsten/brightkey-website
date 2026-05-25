# Project AI Guidelines

## Supabase Initialization Rule
**JavaScript Rule**: The Supabase client is globally initialized as `const sb = window.supabase.createClient(...)` inside `js/auth.js`. 
Because `auth.js` is included on every page that requires authentication or database access, `sb` is globally available. 

- **NEVER** redeclare `const sb` in any inline scripts or other JS files included on the same page. Doing so will cause a fatal `SyntaxError: Identifier 'sb' has already been declared`.
- **ALWAYS** just use the existing `sb` variable directly for all queries (e.g., `await sb.from(...)`).
