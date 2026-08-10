import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';

const AUTH_USERS_PER_PAGE = 100;
const AUTH_USER_PAGE_LIMIT = 100;

export async function findAuthUserByEmail(admin, email, candidateId = null) {
  const normalizedEmail = String(email || '').toLowerCase().trim();

  if (candidateId) {
    const { data, error } = await admin.getUserById(candidateId);
    const candidate = data?.user;
    if (!error && candidate?.email?.toLowerCase().trim() === normalizedEmail) return candidate;
  }

  // Supabase Auth does not provide an exact-email admin lookup. Use its
  // documented paginated user listing as a bounded fallback when the Employee
  // Directory ID is not the preserved Auth ID.
  for (let page = 1; page <= AUTH_USER_PAGE_LIMIT; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: AUTH_USERS_PER_PAGE });
    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find(user => user.email?.toLowerCase().trim() === normalizedEmail);
    if (match) return match;
    if (users.length < AUTH_USERS_PER_PAGE) return null;
  }

  throw new Error('Auth user lookup reached its safety limit.');
}

export default async function handler(req, res) {
  setApiCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const EMAIL_FROM = process.env.EMAIL_FROM || 'BrightKey Solutions <onboarding@brightkeysolutions.com>';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase configuration is missing on server.' });
  }

  const {
    tenant_id,
    company_id,
    role,
    email,
    signature,
    password,
    employee_payload
  } = req.body;

  if (!tenant_id || !company_id || !email || !signature) {
    return res.status(400).json({ error: 'Missing required registration parameters.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const normalizedInviteEmail = email.toLowerCase().trim();
    if (!await enforceRateLimit({
      supabase, req, res, scope: 'register-employee', identifier: normalizedInviteEmail, limit: 10, windowSeconds: 3600
    })) return;

    const tokenHash = createHash('sha256').update(signature).digest('hex');
    const { data: invite, error: inviteErr } = await supabase
      .from('company_invitations')
      .select('company_id, role, expires_at, used_at')
      .eq('tenant_id', tenant_id)
      .eq('company_id', company_id)
      .eq('email', normalizedInviteEmail)
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (inviteErr || !invite || invite.used_at) {
      return res.status(400).json({ error: 'This invitation is invalid or has already been used. Ask your administrator for a new invitation.' });
    }
    if (!invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'This invitation has expired. Ask your administrator for a new invitation.' });
    }
    const invitedRole = invite.role || '';

    // Define activeEmail, resolving placeholders if needed
    let activeEmail = email.toLowerCase().trim();
    const isPlaceholder = activeEmail.endsWith('@placeholder.brightkey.com');
    if (isPlaceholder && employee_payload && (employee_payload.email_address || employee_payload.email)) {
      activeEmail = (employee_payload.email_address || employee_payload.email).toLowerCase().trim();
    }

    // 1c. Fetch existing employee by email to reuse their information if they exist
    const { data: existingEmp, error: empFetchErr } = await supabase
      .from('employees')
      .select('id, first_name, last_name')
      .eq('company_id', company_id)
      .eq('email', activeEmail)
      .maybeSingle();
    if (empFetchErr) {
      console.error('Employee lookup failed:', empFetchErr);
      return res.status(503).json({ error: 'Your employee record could not be checked. Please try again shortly.' });
    }

    let firstName = 'N/A';
    let lastName = 'N/A';
    if (existingEmp) {
      firstName = existingEmp.first_name || 'N/A';
      lastName = existingEmp.last_name || 'N/A';
    } else if (employee_payload) {
      firstName = employee_payload.first_name || 'N/A';
      lastName = employee_payload.last_name || 'N/A';
    }
    const fullName = `${firstName} ${lastName}`.trim();

    let userId = null;
    let createdAuthUser = false;
    let createdMembership = false;
    let reusedAuthUser = null;

    // Removing tenant access intentionally keeps the shared auth identity and
    // Employee Directory record. A later invitation reconnects that identity
    // instead of trying to create a duplicate Supabase Auth user.
    try {
      reusedAuthUser = await findAuthUserByEmail(supabase.auth.admin, activeEmail, existingEmp?.id || null);
    } catch (authLookupError) {
      console.error('Existing Auth User Lookup Error:', authLookupError);
      return res.status(503).json({ error: 'Your existing login could not be checked. Please try again shortly.' });
    }
    if (reusedAuthUser) {
      userId = reusedAuthUser.id;
    }

    if (!userId) {
      if (!password) {
        return res.status(400).json({ error: 'Create a password to finish setting up this new BrightKey account.' });
      }
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: activeEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          needs_password_reset: false
        }
      });
      if (authError || !authData?.user) {
        console.error('Auth User Creation Error:', authError);
        return res.status(400).json({ error: 'This email already has a login that could not be linked automatically. Please contact your administrator.' });
      }
      userId = authData.user.id;
      createdAuthUser = true;
    }

    const rollbackMembership = async () => {
      if (createdMembership) {
        await supabase.from('tenant_members').delete()
          .eq('tenant_id', tenant_id)
          .eq('user_id', userId);
      }
      if (createdAuthUser) await supabase.auth.admin.deleteUser(userId);
    };

    // 3. Create tenant member record
    // Decode the role/access format from the invitation URL:
    //   'admin'            → role='admin', accessible_modules=[]
    //   'access:Mod1,Mod2' → role=null, accessible_modules=['Mod1','Mod2']
    let memberRole = null;
    let memberModules = [];
    if (invitedRole === 'admin') {
      memberRole = 'admin';
    } else if (invitedRole.startsWith('access:')) {
      memberModules = invitedRole.substring(7).split(',').map(s => s.trim()).filter(Boolean);
    }

    const { data: existingMembership, error: membershipLookupError } = await supabase.from('tenant_members')
      .select('id').eq('tenant_id', tenant_id).eq('user_id', userId).maybeSingle();
    if (membershipLookupError) {
      console.error('Tenant Member Lookup Error:', membershipLookupError);
      if (createdAuthUser) await supabase.auth.admin.deleteUser(userId);
      return res.status(503).json({ error: 'Workspace access could not be checked. Please try again shortly.' });
    }
    if (reusedAuthUser && !existingMembership && !password) {
      return res.status(400).json({ error: 'Create a password to restore access to this BrightKey account.' });
    }
    if (!existingMembership) {
      const { error: tmError } = await supabase.from('tenant_members').insert({
        tenant_id: tenant_id,
        user_id: userId,
        role: memberRole,
        accessible_modules: memberModules,
        user_email: activeEmail,
        full_name: fullName
      });

      if (tmError) {
        console.error('Tenant Member Insert Error:', tmError);
        if (createdAuthUser) await supabase.auth.admin.deleteUser(userId);
        return res.status(500).json({ error: 'Workspace access could not be restored. Please ask your administrator to check the existing membership.' });
      }
      createdMembership = true;
    }

    if (reusedAuthUser && password) {
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(reusedAuthUser.id, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(reusedAuthUser.user_metadata || {}),
          full_name: fullName,
          needs_password_reset: false
        }
      });
      if (updateAuthError) {
        console.error('Existing Auth User Update Error:', updateAuthError);
        await rollbackMembership();
        return res.status(400).json({ error: 'Your existing account could not be reactivated. Please ask your administrator to resend the invitation.' });
      }
    }

    // 4. Update or Create employee record
    if (existingEmp) {
      if (existingEmp.id !== userId) {
        // Update an unlinked directory record to the newly created auth ID.
        const { error: empUpdateErr } = await supabase
          .from('employees')
          .update({ id: userId })
          .eq('id', existingEmp.id);

        if (empUpdateErr) {
          console.error('Failed to link existing employee ID:', empUpdateErr);
          await rollbackMembership();
          return res.status(500).json({ error: 'Your employee record could not be linked to the account. Please contact your administrator.' });
        }
      }
    } else {
      // Fetch employee prefix from global_settings
      let employeePrefix = 'BK';
      try {
        const { data: hrConf } = await supabase
          .from('global_settings')
          .select('value')
          .eq('key', 'hr_configuration')
          .eq('company_id', company_id)
          .maybeSingle();

        if (hrConf && hrConf.value && hrConf.value.employee_prefix) {
          employeePrefix = hrConf.value.employee_prefix.toUpperCase().trim();
        }
      } catch (e) {
        console.warn('Failed to fetch HR prefix settings, using default "BK":', e);
      }

      // Fetch all existing employee numbers for this company to calculate max sequence
      let nextNum = 1;
      try {
        const { data: emps } = await supabase
          .from('employees')
          .select('employee_number')
          .eq('company_id', company_id);

        if (emps && emps.length > 0) {
          let maxNum = 0;
          const regex = new RegExp(`^${employeePrefix}-(\\d+)`);
          emps.forEach(emp => {
            const numStr = emp.employee_number || '';
            const match = numStr.match(regex) || numStr.match(/^[A-Z]{1,3}-(\d+)/);
            if (match) {
              const val = parseInt(match[1], 10);
              if (val > maxNum) maxNum = val;
            }
          });
          nextNum = maxNum + 1;
        }
      } catch (e) {
        console.warn('Failed to calculate next employee number sequence:', e);
      }

      let employeeNumber = '';
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 100) {
        let potentialNum = `${employeePrefix}-${String(nextNum + attempts).padStart(4, '0')}`;

        // Check if this employee number already exists in the database
        const { data: existing, error: existError } = await supabase
          .from('employees')
          .select('id')
          .eq('employee_number', potentialNum)
          .maybeSingle();

        if (!existError && !existing) {
          employeeNumber = potentialNum;
          isUnique = true;
        }
        attempts++;
      }

      if (!employeeNumber) {
        // Rollback
        await rollbackMembership();
        return res.status(500).json({ error: 'Failed to generate a unique employee number after multiple attempts.' });
      }

      const finalEmployeePayload = employee_payload ? {
        ...employee_payload,
        company_id: company_id,
        email: activeEmail,
        employee_number: employeeNumber,
        id: userId
      } : {
        id: userId,
        company_id: company_id,
        email: activeEmail,
        first_name: firstName,
        last_name: lastName,
        employee_number: employeeNumber,
        employment_status: 'Active',
        date_of_birth: '1970-01-01',
        address: 'N/A',
        contact_number: 'N/A',
        emergency_contact_number: 'N/A'
      };

      const { error: empError } = await supabase.from('employees').insert(finalEmployeePayload);
      if (empError) {
        console.error('Employee Insert Error:', empError);
        // Rollback tenant member and auth user
        await rollbackMembership();
        return res.status(500).json({ error: 'Your employee record could not be created. Please contact your administrator.' });
      }
    }

    // 5. Retain the invitation as an audit record and make it unusable.
    await supabase.from('company_invitations')
      .update({ used_at: new Date().toISOString() })
      .eq('tenant_id', tenant_id)
      .eq('company_id', company_id)
      .eq('email', normalizedInviteEmail)
      .eq('token_hash', tokenHash);

    // 6. Send welcome email via Resend
    let emailSent = false;
    if (RESEND_API_KEY) {
      try {
        const mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: activeEmail,
            subject: 'Welcome to Brightkey Solutions - Account Activated',
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h2 style="color: #0891b2; font-weight: bold; margin-bottom: 20px;">Welcome to BrightKey Solutions!</h2>
                <p>Hello ${employee_payload.first_name},</p>
                <p>Your employee profile has been created and your account is now active.</p>
                <p>You can access your dashboard at any time by signing in with your email and ${existingMembership ? 'your existing BrightKey password' : 'the password you created'}:</p>
                <p style="margin-top: 20px;">
                  <a href="https://www.brightkeysolutions.com/login" style="background-color: #06b6d4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                    Access Your Dashboard
                  </a>
                </p>
              </div>
            `
          })
        });

        if (mailRes.ok) {
          emailSent = true;
        } else {
          const mailErr = await mailRes.json();
          console.error('Resend API error:', mailErr);
        }
      } catch (err) {
        console.error('Failed to dispatch email via Resend:', err);
      }
    }

    return res.status(200).json({
      success: true,
      email_sent: emailSent
    });

  } catch (err) {
    console.error('Registration processing crash:', err);
    return res.status(500).json({ error: `Server crash: ${err.message}` });
  }
}
