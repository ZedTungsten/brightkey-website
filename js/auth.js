/* ============================================================
   BrightKey — auth.js
   Supabase Auth helpers. Requires @supabase/supabase-js via CDN.
   ============================================================ */

'use strict';

const SUPABASE_URL  = 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';

// Initialise official Supabase client (loaded from CDN before this script)
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

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

window.BKAuth = { sb, requireAuth, redirectIfAuth, signIn, signUp, signOut, getUser };
