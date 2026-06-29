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
