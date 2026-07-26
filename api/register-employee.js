import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { setApiCors } from '../lib/api/security.js';

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

  if (!tenant_id || !company_id || !email || !signature || !password) {
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
      .select('*')
      .eq('company_id', company_id)
      .eq('email', activeEmail)
      .maybeSingle();

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
      return res.status(400).json({ error: 'An account with this email already exists or could not be created.' });
    }
    const userId = authData.user.id;

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
      // Rollback auth user
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: `Database Error (tenant_members): ${tmError.message}` });
    }

    // 4. Update or Create employee record
    if (existingEmp) {
      // Update existing employee ID to match the auth user ID
      const { error: empUpdateErr } = await supabase
        .from('employees')
        .update({ id: userId })
        .eq('id', existingEmp.id);

      if (empUpdateErr) {
        console.error('Failed to link existing employee ID:', empUpdateErr);
        // Rollback
        await supabase.from('tenant_members').delete().eq('user_id', userId);
        await supabase.auth.admin.deleteUser(userId);
        return res.status(500).json({ error: `Database Error (linking employee): ${empUpdateErr.message}` });
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
        await supabase.from('tenant_members').delete().eq('user_id', userId);
        await supabase.auth.admin.deleteUser(userId);
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
        await supabase.from('tenant_members').delete().eq('user_id', userId);
        await supabase.auth.admin.deleteUser(userId);
        return res.status(500).json({ error: `Database Error (employees): ${empError.message}` });
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
                <p>You can access your dashboard at any time by signing in with your email and the password you created:</p>
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
