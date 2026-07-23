/* ============================================================
   BrightKey — auth.js
   Supabase Auth helpers. Requires @supabase/supabase-js via CDN.
   Wrapped in an IIFE so internal vars (SUPABASE_URL, SUPABASE_ANON, sb)
   never enter the global lexical scope and never conflict with
   page-level const declarations of the same names.
   ============================================================ */

(function () {
  'use strict';

  var SUPABASE_URL  = 'https://ymjlosnxuhsybkzkoofq.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';

  // Initialise official Supabase client (loaded from CDN before this script)
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  let cachedUserPromise = null;
  let cachedUserRolePromise = null;
  let cachedRoleGatePromise = null;

  const contextCache = {
    companyPromises: {},
    employeePromises: {},
    employeeIdPromises: {},
    statusPromises: {}
  };

  /**
   * Convert technical request/database errors into safe, actionable UI copy.
   * Full error objects should still be logged to the console by the caller.
   */
  function friendlyError(errorOrMessage, fallback = 'Something went wrong. Please try again.') {
    const raw = String(errorOrMessage?.message || errorOrMessage || '').trim();
    if (!raw) return fallback;
    const message = raw.replace(/^Error:\s*/i, '');
    const lower = message.toLowerCase();

    if (/23505|duplicate key|unique constraint|\b409\b|already exists/.test(lower)) {
      return 'An item with these details already exists. Review the information and try again.';
    }
    if (/23503|foreign key|still referenced|violates.*reference/.test(lower)) {
      return 'This item is still in use and cannot be removed yet.';
    }
    if (/jwt|token.*expired|session.*expired|\b401\b|not authenticated/.test(lower)) {
      return 'Your session has expired. Sign in again and retry the action.';
    }
    if (/42501|row-level security|permission denied|not authorized|forbidden|\b403\b/.test(lower)) {
      return 'You do not have permission to complete this action. Contact an administrator if you need access.';
    }
    if (/payload too large|request body.*large|file.*too large|image.*too large|\b413\b/.test(lower)) {
      return 'The selected file is too large. Choose a smaller file and try again.';
    }
    if (/notallowederror|getusermedia|camera.*permission|microphone.*permission/.test(lower)) {
      return 'Camera access is blocked. Allow camera permission in your browser settings and try again.';
    }
    if (/notreadableerror|camera.*(busy|in use)/.test(lower)) {
      return 'The camera is currently unavailable or being used by another application.';
    }
    if (/storage.*limit|quota.*(reached|exceeded)|insufficient storage/.test(lower)) {
      return 'The company storage limit has been reached. Remove files or ask an administrator to increase the limit.';
    }
    if (/too many requests|rate limit|\b429\b/.test(lower)) {
      return 'Too many requests were made. Wait a moment and try again.';
    }
    if (/failed to fetch|fetch failed|networkerror|network request|connection|offline|econn|timeout|timed out/.test(lower)) {
      return 'We could not connect to the server. Check your internet connection and try again.';
    }
    if (/\b404\b|not found/.test(lower)) {
      return 'The requested information could not be found. Refresh the page and try again.';
    }
    if (/\b5\d\d\b|internal server|service unavailable|bad gateway|gateway timeout/.test(lower)) {
      return 'The service is temporarily unavailable. Please try again in a moment.';
    }
    if (/22p02|23\d{3}|pgrst\d+|invalid input syntax|violates.*constraint|relation .* does not exist|column .* does not exist|database|sql/.test(lower)) {
      return 'We could not process the submitted information. Review the fields and try again.';
    }
    if (/syntaxerror|typeerror|referenceerror|unexpected token|is not defined|cannot read propert|cannot set propert|stack trace|\[object object\]/.test(lower)) {
      return 'Something went wrong on this page. Refresh it and try again.';
    }

    // Keep already-actionable validation instructions while removing a generic
    // "Error:" prefix. These messages do not contain system implementation details.
    if (/^(please\b|select\b|enter\b|choose\b)|\b(is required|must be|cannot be empty|valid email|valid date)\b/.test(lower)) {
      return message;
    }

    // Do not expose arbitrary exception details appended by legacy call sites.
    // Keep the failed action clear so the message remains useful.
    const actionMessages = [
      [/\b(load|fetch|refresh|initialize|initialise)\b/, 'The information could not be loaded. Refresh the page and try again.'],
      [/\b(upload|photo|image|file)\b/, 'The file could not be uploaded. Check the file and try again.'],
      [/\b(save|update|autosave|submit|apply|confirm|record)\b/, 'Your changes could not be saved. Review the information and try again.'],
      [/\b(delete|remove|clear)\b/, 'The item could not be removed. Refresh the page and try again.'],
      [/\b(add|create)\b/, 'The item could not be created. Review the information and try again.'],
      [/\b(link|connect)\b/, 'The connection could not be completed. Check the details and try again.'],
      [/\b(move|transfer)\b/, 'The selected items could not be moved. Refresh the page and try again.']
    ];
    if (/^(error|failed|failure|unable|could not|operation failed|submission failed)\b/i.test(message)) {
      const match = actionMessages.find(([pattern]) => pattern.test(lower));
      return match ? match[1] : fallback;
    }
    return message;
  }

  window.BKFriendlyError = friendlyError;

  // Local page-specific toast helpers are common in the dashboard. Sanitize
  // their error output and inline error states as a final safety net even when
  // they bypass window.Toast.
  function sanitizeErrorToast(node) {
    const root = node instanceof Element ? node : node?.parentElement;
    if (!root) return;
    const selector = [
      '.toast',
      '[class*="toast-"]',
      '[class*="notification-"]',
      '.error',
      '[class*="-error"]',
      '[class*="error-"]',
      '[style*="var(--danger)"]'
    ].join(',');
    const candidates = [root, ...root.querySelectorAll(selector)];
    candidates.forEach(candidate => {
      const classes = String(candidate.className || '').toLowerCase();
      const style = String(candidate.getAttribute?.('style') || '').toLowerCase();
      const isToast = classes.includes('toast') || classes.includes('notification');
      const isErrorState = classes.includes('error') || classes.includes('danger') || style.includes('var(--danger)');
      if (!isErrorState || (isToast && !classes.includes('error') && !classes.includes('danger'))) return;
      const safe = friendlyError(candidate.textContent);
      if (safe && safe !== candidate.textContent) candidate.textContent = safe;
    });
  }

  function observeErrorToasts() {
    if (!document.body || window.__bkErrorToastObserver) return;
    window.__bkErrorToastObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(sanitizeErrorToast);
        if (mutation.type === 'characterData') sanitizeErrorToast(mutation.target);
      });
    });
    window.__bkErrorToastObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeErrorToasts, { once: true });
  else observeErrorToasts();

  /**
   * Get the current session user (null if not logged in).
   */
  async function getUser() {
    if (!cachedUserPromise) {
      cachedUserPromise = (async () => {
        const { data: { session } } = await sb.auth.getSession();
        return session?.user ?? null;
      })();
    }
    return cachedUserPromise;
  }

  /**
   * Protect a page. Redirects to login if no active session.
   * Returns the user object if authenticated.
   */
  async function requireAuth(redirectTo = 'admin.html') {
    if (!cachedUserPromise) {
      cachedUserPromise = (async () => {
        const { data: { session } } = await sb.auth.getSession();
        return session?.user ?? null;
      })();
    }
    const user = await cachedUserPromise;
    if (!user) {
      window.location.href = redirectTo;
      return null;
    }
    return user;
  }

  /**
   * Redirect already-authenticated users away from login/register.
   */
  async function redirectIfAuth(to = 'dashboard.html') {
    if (!cachedUserPromise) {
      cachedUserPromise = (async () => {
        const { data: { session } } = await sb.auth.getSession();
        return session?.user ?? null;
      })();
    }
    const user = await cachedUserPromise;
    if (user) window.location.href = to;
  }

  /**
   * Sign in with email + password.
   */
  async function signIn(email, password) {
    cachedUserPromise = null;
    cachedUserRolePromise = null;
    cachedRoleGatePromise = null;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  /**
   * Register a new employee account.
   * Stores full_name in user_metadata.
   */
  async function signUp(email, password, fullName) {
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: 'https://brightkeysolutions.com/admin',
      },
    });
    if (error) throw error;
    return data;
  }

  /**
   * Sign out the current user.
   */
  async function signOut() {
    cachedUserPromise = null;
    cachedUserRolePromise = null;
    cachedRoleGatePromise = null;
    contextCache.companyPromises = {};
    contextCache.employeePromises = {};
    contextCache.employeeIdPromises = {};
    contextCache.statusPromises = {};
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    window.location.href = 'admin.html';
  }

  /**
   * Get the current user's membership info.
   * Returns { role, tenantId, modules } or null.
   *   role    — 'owner' | 'admin' | null
   *   tenantId — UUID of the user's tenant
   *   modules — string[] of accessible modules (empty for owner/admin; they bypass checks)
   */
  async function getUserRole() {
    if (!cachedUserRolePromise) {
      cachedUserRolePromise = (async () => {
        const user = await getUser();
        if (!user) return null;

        const { data, error } = await sb
          .from('tenant_members')
          .select('role, tenant_id, accessible_modules')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (error || !data) return null;
        return {
          role: data.role,
          tenantId: data.tenant_id,
          modules: data.accessible_modules || []
        };
      })();
    }
    return cachedUserRolePromise;
  }

  /**
   * Gate access based on required modules.
   *
   * - owner / admin always pass regardless of requiredModules.
   * - Other users pass if their accessible_modules contains at least one of requiredModules.
   * - Pass an empty array [] to restrict the page to owner/admin only.
   *
   * Returns { user, role, tenantId, modules } on success, or redirects and returns null.
   */
  async function checkRoleGate(requiredModules = [], redirectTo = '../../admin.html') {
    if (!cachedRoleGatePromise) {
      cachedRoleGatePromise = (async () => {
        const user = await requireAuth(redirectTo);
        if (!user) return null;

        const memberInfo = await getUserRole();
        if (!memberInfo) {
          window.location.href = redirectTo;
          return null;
        }

        const { role, tenantId, modules } = memberInfo;

        // Owners and admins always have full access
        if (role === 'owner' || role === 'admin') {
          return { user, role, tenantId, modules };
        }

        // No modules required = owner/admin only
        if (requiredModules.length === 0) {
          window.location.href = redirectTo;
          return null;
        }

        // Check if the user has at least one of the required modules (case-insensitive check)
        const hasAccess = requiredModules.some(mod => 
          modules.some(m => m.trim().toLowerCase() === mod.trim().toLowerCase())
        );
        if (!hasAccess) {
          window.location.href = redirectTo;
          return null;
        }

        return { user, role, tenantId, modules };
      })();
    }
    return cachedRoleGatePromise;
  }

  function getCompany(tenantId) {
    if (!tenantId) return Promise.resolve(null);
    if (!contextCache.companyPromises[tenantId]) {
      contextCache.companyPromises[tenantId] = (async () => {
        const { data, error } = await sb
          .from('companies')
          .select('id')
          .eq('tenant_id', tenantId)
          .limit(1)
          .maybeSingle();
        if (error || !data) return null;
        return data;
      })();
    }
    return contextCache.companyPromises[tenantId];
  }

  function getEmployee(email) {
    if (!email) return Promise.resolve(null);
    const key = email.toLowerCase().trim();
    if (!contextCache.employeePromises[key]) {
      contextCache.employeePromises[key] = (async () => {
        const { data, error } = await sb
          .from('employees')
          .select('id, first_name, last_name, department, reporting_to, picture_link')
          .eq('email', key)
          .limit(1)
          .maybeSingle();
        if (error || !data) return null;
        return data;
      })();
    }
    return contextCache.employeePromises[key];
  }

  function getEmployeeById(userId) {
    if (!userId) return Promise.resolve(null);
    if (!contextCache.employeeIdPromises[userId]) {
      contextCache.employeeIdPromises[userId] = (async () => {
        const { data, error } = await sb
          .from('employees')
          .select('id, first_name, last_name, department, reporting_to, picture_link')
          .eq('id', userId)
          .limit(1)
          .maybeSingle();
        if (error || !data) return null;
        return data;
      })();
    }
    return contextCache.employeeIdPromises[userId];
  }

  function getEmployeeStatus(employeeId) {
    if (!employeeId) return Promise.resolve(null);
    if (!contextCache.statusPromises[employeeId]) {
      contextCache.statusPromises[employeeId] = (async () => {
        const { data, error } = await sb
          .from('attendance_logs')
          .select('status, created_at')
          .eq('employee_id', employeeId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error || !data) return 'offline';
        const logTime = new Date(data.created_at);
        const logDate = logTime.toLocaleDateString('en-US');
        const todayDate = new Date().toLocaleDateString('en-US');
        if (logDate !== todayDate) {
          return 'offline';
        }
        return data.status || 'offline';
      })();
    }
    return contextCache.statusPromises[employeeId];
  }

  function formatStorageBytes(bytes) {
    const value = Math.max(Number(bytes) || 0, 0);
    if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(2)} GB`;
    return `${(value / (1024 ** 2)).toFixed(2)} MB`;
  }

  async function checkStorageQuota(companyId, incomingFileOrBytes) {
    const incomingBytes = typeof incomingFileOrBytes === 'number'
      ? incomingFileOrBytes
      : Number(incomingFileOrBytes?.size || 0);
    if (!companyId) throw new Error('A company is required before uploading a file.');

    const { data, error } = await sb.rpc('check_company_storage_quota', {
      p_company_id: companyId,
      p_incoming_bytes: incomingBytes
    });
    if (error) {
      console.error('Storage quota check failed:', error);
      throw new Error('Storage availability could not be verified. Please try the upload again.');
    }

    const quota = Array.isArray(data) ? data[0] : data;
    if (!quota?.allowed) {
      const limit = formatStorageBytes(quota?.limit_bytes);
      throw new Error(`Storage limit reached (${limit}). Remove files or ask an administrator to increase the tenant storage allocation.`);
    }
    return quota;
  }

  /**
   * Send a request that requires the current Supabase session. Upload API
   * routes validate this bearer token so Storage RLS can authorize the
   * signed-in user against the company-scoped object path.
   */
  async function authenticatedFetch(input, init = {}) {
    const { data, error } = await sb.auth.getSession();
    const accessToken = data?.session?.access_token;
    if (error || !accessToken) {
      throw new Error('Your session has expired. Sign in again before uploading.');
    }

    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${accessToken}`);

    return window.fetch(input, {
      ...init,
      headers
    });
  }

  // Export everything through window.BKAuth — the only global this file touches
  window.BKAuth = {
    sb,
    requireAuth,
    redirectIfAuth,
    signIn,
    signUp,
    signOut,
    getUser,
    getUserRole,
    checkRoleGate,
    getCompany,
    getEmployee,
    getEmployeeById,
    getEmployeeStatus,
    authenticatedFetch,
    checkStorageQuota,
    formatStorageBytes,
    contextCache
  };

}());
