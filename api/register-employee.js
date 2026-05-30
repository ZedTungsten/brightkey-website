import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

function generateTempPassword() {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+~|}{[]:;?><,./-';
  
  let pass = '';
  pass += lowercase[Math.floor(Math.random() * lowercase.length)];
  pass += uppercase[Math.floor(Math.random() * uppercase.length)];
  pass += numbers[Math.floor(Math.random() * numbers.length)];
  pass += symbols[Math.floor(Math.random() * symbols.length)];
  
  const allChars = lowercase + uppercase + numbers + symbols;
  for (let i = 0; i < 8; i++) {
    pass += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  return pass.split('').sort(() => 0.5 - Math.random()).join('');
}

function verifySignature(tenant, company, role, email, sig) {
  const msg = `${tenant}:${company}:${role}:${email}:brightkey_invite_salt`;
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
    employee_payload
  } = req.body;

  if (!tenant_id || !company_id || !role || !email || !signature || !employee_payload) {
    return res.status(400).json({ error: 'Missing required registration parameters.' });
  }

  // 1. Verify invite signature
  if (!verifySignature(tenant_id, company_id, role, email, signature)) {
    return res.status(400).json({ error: 'Invalid invitation signature. Registration rejected.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // 2. Generate temp password
    const tempPassword = generateTempPassword();

    // 3. Create auth user with service role client
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: `${employee_payload.first_name} ${employee_payload.last_name}`,
        needs_password_reset: true
      }
    });

    if (authError) {
      console.error('Auth User Creation Error:', authError);
      return res.status(400).json({ error: `Auth Error: ${authError.message}` });
    }

    const userId = authData.user.id;

    // 4. Create tenant member record
    const { error: tmError } = await supabase.from('tenant_members').insert({
      tenant_id: tenant_id,
      user_id: userId,
      role: role,
      user_email: email,
      full_name: `${employee_payload.first_name} ${employee_payload.last_name}`
    });

    if (tmError) {
      console.error('Tenant Member Insert Error:', tmError);
      // Rollback auth user
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: `Database Error (tenant_members): ${tmError.message}` });
    }

    // 5. Create employee record
    const finalEmployeePayload = {
      ...employee_payload,
      id: userId // Set public.employees ID to match the auth user ID for simple relation
    };

    const { error: empError } = await supabase.from('employees').insert(finalEmployeePayload);
    if (empError) {
      console.error('Employee Insert Error:', empError);
      // Rollback tenant member and auth user
      await supabase.from('tenant_members').delete().eq('user_id', userId);
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: `Database Error (employees): ${empError.message}` });
    }

    // 6. Delete the pending invitation since user has successfully registered
    await supabase.from('company_invitations')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('email', email);

    // 7. Send welcome email via Resend
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
            to: email,
            subject: 'Welcome to BrightKey Solutions - Temporary Login Details',
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h2 style="color: #0891b2; font-weight: bold; margin-bottom: 20px;">Welcome to BrightKey Solutions!</h2>
                <p>Hello ${employee_payload.first_name},</p>
                <p>Your registration is complete. An account has been created for you under your organization's workspace.</p>
                <p>Please use the following temporary password to sign in:</p>
                <div style="background-color: #f3f4f6; padding: 12px 20px; font-size: 18px; font-family: monospace; border-radius: 6px; display: inline-block; letter-spacing: 1px; margin: 10px 0; border: 1px dashed #d1d5db;">
                  <strong>${tempPassword}</strong>
                </div>
                <p style="margin-top: 20px;">
                  <a href="https://www.brightkeysolutions.com/login" style="background-color: #06b6d4; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                    Sign In to Your Account
                  </a>
                </p>
                <p style="font-size: 13px; color: #6b7280; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 15px;">
                  * For security reasons, you will be prompted to change this temporary password to a strong password immediately upon logging in.
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
    } else {
      console.warn('RESEND_API_KEY is not defined. Email skip.');
    }

    return res.status(200).json({
      success: true,
      email_sent: emailSent,
      // For local development fallback if Resend is not configured / during test:
      ...(!emailSent && { temp_pass_fallback: tempPassword })
    });

  } catch (err) {
    console.error('Registration processing crash:', err);
    return res.status(500).json({ error: `Server crash: ${err.message}` });
  }
}
