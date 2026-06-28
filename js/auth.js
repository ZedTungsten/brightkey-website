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
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        if (logTime < twelveHoursAgo) {
          return 'offline';
        }
        return data.status || 'offline';
      })();
    }
    return contextCache.statusPromises[employeeId];
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
    contextCache
  };

}());
