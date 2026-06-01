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

  /**
   * Protect a page. Redirects to login if no active session.
   * Returns the user object if authenticated.
   */
  async function requireAuth(redirectTo = 'admin.html') {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      window.location.href = redirectTo;
      return null;
    }
    return session.user;
  }

  /**
   * Redirect already-authenticated users away from login/register.
   */
  async function redirectIfAuth(to = 'dashboard.html') {
    const { data: { session } } = await sb.auth.getSession();
    if (session) window.location.href = to;
  }

  /**
   * Sign in with email + password.
   */
  async function signIn(email, password) {
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
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    window.location.href = 'admin.html';
  }

  /**
   * Get the current session user (null if not logged in).
   */
  async function getUser() {
    const { data: { session } } = await sb.auth.getSession();
    return session?.user ?? null;
  }

  /**
   * Get the role of the current user in their tenant.
   */
  async function getUserRole() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    
    const { data, error } = await sb
      .from('tenant_members')
      .select('role, tenant_id')
      .eq('user_id', session.user.id)
      .limit(1);
      
    if (error || !data || data.length === 0) return null;
    return { role: data[0].role, tenantId: data[0].tenant_id };
  }

  /**
   * Gate access based on allowed roles. Redirects if unauthorized.
   */
  async function checkRoleGate(allowedRoles, redirectTo = '../../admin.html') {
    const user = await requireAuth(redirectTo);
    if (!user) return null;
    
    const roleInfo = await getUserRole();
    if (!roleInfo) {
      window.location.href = redirectTo;
      return null;
    }

    const userRole = roleInfo.role;

    // 1. Owner & Admin always have access
    if (userRole === 'owner' || userRole === 'admin') {
      return { user, role: userRole, tenantId: roleInfo.tenantId };
    }

    // 2. Direct static role check
    if (allowedRoles.includes(userRole)) {
      return { user, role: userRole, tenantId: roleInfo.tenantId };
    }

    // 3. Dynamic role lookup
    try {
      const { data: dbRole, error } = await sb
        .from('dashboard_roles')
        .select('accessible_modules')
        .eq('name', userRole)
        .maybeSingle();

      if (!error && dbRole && Array.isArray(dbRole.accessible_modules)) {
        const MODULE_GATE_MAP = {
          'Products': ['products'],
          'Operations': ['operations'],
          'Marketing': ['marketing'],
          'Sales': ['sales'],
          'Customer Service': ['customer_service'],
          'Logistics': ['logistics'],
          'HR': ['hr'],
          'Finance': ['accounting']
        };

        const allowedKeys = new Set();
        dbRole.accessible_modules.forEach(mod => {
          const keys = MODULE_GATE_MAP[mod];
          if (keys) keys.forEach(k => allowedKeys.add(k));
        });

        const hasAccess = allowedRoles.some(roleKey => allowedKeys.has(roleKey));
        if (hasAccess) {
          return { user, role: userRole, tenantId: roleInfo.tenantId };
        }
      }
    } catch (err) {
      console.error('Error verifying dynamic role gate:', err);
    }
    
    window.location.href = redirectTo;
    return null;
  }

  // Export everything through window.BKAuth — the only global this file touches
  window.BKAuth = { sb, requireAuth, redirectIfAuth, signIn, signUp, signOut, getUser, getUserRole, checkRoleGate };

}());
