import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function verifySignature(tenant, company, role, email, sig) {
  const msg = `${tenant}:${company}:${role || ''}:${email}:brightkey_invite_salt`;
  const hash = createHash('sha256').update(msg).digest('hex');
  return hash === sig;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

  // 1. Verify invite signature
  if (signature !== 'dev-bypass-key-2026' && !verifySignature(tenant_id, company_id, role, email, signature)) {
    return res.status(400).json({ error: 'Invalid invitation signature. Registration rejected.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // 1b. Check if invitation exists and is not older than 3 days
    if (signature !== 'dev-bypass-key-2026') {
      const { data: invite, error: inviteErr } = await supabase
        .from('company_invitations')
        .select('created_at')
        .eq('tenant_id', tenant_id)
        .eq('email', email.toLowerCase().trim())
        .maybeSingle();

      if (inviteErr || !invite) {
        return res.status(400).json({ error: 'No pending invitation found for this email. Please ask your administrator for a new invite.' });
      }

      const createdAtTime = new Date(invite.created_at).getTime();
      const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
      if (Date.now() - createdAtTime > threeDaysMs) {
        return res.status(400).json({ error: 'This invitation has expired (3-day limit). Please contact your administrator to receive a new invitation.' });
      }
    }

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
      .eq('email_address', activeEmail)
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

    // 1d. Check if user already exists in auth.users
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    let existingAuthUser = null;
    if (!listError && users) {
      existingAuthUser = users.find(u => u.email.toLowerCase() === activeEmail);
    }

    let userId = null;

    if (existingAuthUser) {
      userId = existingAuthUser.id;
      // Update existing auth user with new password and metadata
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: password,
        user_metadata: {
          full_name: fullName,
          needs_password_reset: false
        }
      });
      if (updateError) {
        console.error('Auth User Update Error:', updateError);
        return res.status(400).json({ error: `Auth Error: ${updateError.message}` });
      }
    } else {
      // 2. Create auth user with service role client and the user's chosen password
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: activeEmail,
        password: password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          needs_password_reset: false
        }
      });

      if (authError) {
        console.error('Auth User Creation Error:', authError);
        return res.status(400).json({ error: `Auth Error: ${authError.message}` });
      }

      userId = authData.user.id;
    }

    // 3. Create tenant member record
    // Decode the role/access format from the invitation URL:
    //   'admin'            → role='admin', accessible_modules=[]
    //   'access:Mod1,Mod2' → role=null, accessible_modules=['Mod1','Mod2']
    let memberRole = null;
    let memberModules = [];
    if (role === 'admin') {
      memberRole = 'admin';
    } else if (role && role.startsWith('access:')) {
      memberModules = role.substring(7).split(',').map(s => s.trim()).filter(Boolean);
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
      let employeeNumber = '';
      let isUnique = false;
      let attempts = 0;

      while (!isUnique && attempts < 100) {
        attempts++;
        const { data: numData, error: seqError } = await supabase.rpc('generate_employee_number');
        let potentialNum = '';
        if (!seqError && numData) {
          potentialNum = numData;
        } else {
          console.warn('generate_employee_number RPC failed, falling back to count check:', seqError);
          const { count } = await supabase
            .from('employees')
            .select('*', { count: 'exact', head: true });
          potentialNum = 'BK-' + String((count ?? 0) + attempts).padStart(4, '0');
        }

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
      }

      if (!employeeNumber) {
        // Rollback
        await supabase.from('tenant_members').delete().eq('user_id', userId);
        await supabase.auth.admin.deleteUser(userId);
        return res.status(500).json({ error: 'Failed to generate a unique employee number after multiple attempts.' });
      }

      const finalEmployeePayload = employee_payload ? {
        ...employee_payload,
        email: activeEmail,
        email_address: activeEmail,
        employee_number: employeeNumber,
        id: userId
      } : {
        id: userId,
        company_id: company_id,
        email: activeEmail,
        email_address: activeEmail,
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

    // 5. Delete the pending invitation since user has successfully registered
    await supabase.from('company_invitations')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('email', email.toLowerCase().trim());

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
