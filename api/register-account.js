import { createHash } from 'crypto';
import { createServiceClient, setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';
import { findAuthUserByEmail } from './register-employee.js';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export default async function handler(req, res) {
  setApiCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { tenant_id, company_id, email, signature, password } = req.body || {};
  if (!tenant_id || !company_id || !email || !signature || !password) {
    return res.status(400).json({ error: 'Missing required registration parameters.' });
  }
  if (!PASSWORD_PATTERN.test(password)) {
    return res.status(400).json({ error: 'Use at least 8 characters with uppercase, lowercase, number, and special-character values.' });
  }

  try {
    const supabase = createServiceClient();
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!await enforceRateLimit({
      supabase,
      req,
      res,
      scope: 'register-account',
      identifier: normalizedEmail,
      limit: 10,
      windowSeconds: 3600
    })) return;

    const tokenHash = createHash('sha256').update(signature).digest('hex');
    const { data: invitation, error: invitationError } = await supabase
      .from('company_invitations')
      .select('full_name, role, expires_at, used_at')
      .eq('tenant_id', tenant_id)
      .eq('company_id', company_id)
      .eq('email', normalizedEmail)
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (invitationError || !invitation || invitation.used_at) {
      return res.status(400).json({ error: 'This invitation is invalid or has already been used. Ask your administrator for a new invitation.' });
    }
    if (!invitation.expires_at || new Date(invitation.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'This invitation has expired. Ask your administrator for a new invitation.' });
    }

    const { data: existingMember, error: memberLookupError } = await supabase
      .from('tenant_members')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('user_email', normalizedEmail)
      .maybeSingle();
    if (memberLookupError) {
      console.error('Contractor membership lookup failed:', memberLookupError);
      return res.status(503).json({ error: 'Workspace membership could not be checked. Try again shortly.' });
    }
    if (existingMember) {
      return res.status(400).json({ error: 'This account already has access to the workspace. Sign in instead.' });
    }

    let authUser = null;
    try {
      authUser = await findAuthUserByEmail(supabase.auth.admin, normalizedEmail);
    } catch (authLookupError) {
      console.error('Contractor Auth lookup failed:', authLookupError);
      return res.status(503).json({ error: 'Your existing login could not be checked. Try again shortly.' });
    }

    let userId = authUser?.id || null;
    let createdAuthUser = false;
    const fullName = String(invitation.full_name || normalizedEmail).trim();
    if (!userId) {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, needs_password_reset: false }
      });
      if (authError || !authData?.user) {
        console.error('Contractor Auth creation failed:', authError);
        return res.status(400).json({ error: 'This account could not be created. Ask your administrator to resend the invitation.' });
      }
      userId = authData.user.id;
      createdAuthUser = true;
    }

    const invitedRole = String(invitation.role || '');
    const memberRole = ['owner', 'admin'].includes(invitedRole) ? invitedRole : null;
    const memberModules = invitedRole.startsWith('access:')
      ? invitedRole.slice(7).split(',').map(value => value.trim()).filter(Boolean)
      : [];

    const { error: membershipError } = await supabase.from('tenant_members').insert({
      tenant_id,
      user_id: userId,
      role: memberRole,
      accessible_modules: memberModules,
      user_email: normalizedEmail,
      full_name: fullName
    });
    if (membershipError) {
      console.error('Contractor membership creation failed:', membershipError);
      if (createdAuthUser) await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: 'Workspace access could not be created. Ask your administrator to check the invitation.' });
    }

    if (authUser) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(authUser.user_metadata || {}),
          full_name: fullName,
          needs_password_reset: false
        }
      });
      if (authUpdateError) {
        console.error('Contractor Auth update failed:', authUpdateError);
        await supabase.from('tenant_members').delete().eq('tenant_id', tenant_id).eq('user_id', userId);
        return res.status(400).json({ error: 'Your existing login could not be reactivated. Ask your administrator to resend the invitation.' });
      }
    }

    const { error: invitationUpdateError } = await supabase
      .from('company_invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id)
      .eq('company_id', company_id)
      .eq('email', normalizedEmail)
      .eq('token_hash', tokenHash);
    if (invitationUpdateError) {
      console.error('Contractor invitation audit update failed:', invitationUpdateError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Account registration crash:', error);
    return res.status(500).json({ error: 'Account registration is temporarily unavailable. Try again shortly.' });
  }
}
