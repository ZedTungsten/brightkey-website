import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }
  const token = authHeader.split(' ')[1];

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase configuration is missing on server.' });
  }

  const { tenant_id, company_id, email, full_name, role, password } = req.body;
  if (!tenant_id || !company_id || !email || !full_name || !password) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  // Password validation: min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!passwordRegex.test(password)) {
    return res.status(400).json({ error: 'Password does not meet validation requirements (at least 8 characters long, contain at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character).' });
  }

  // Initialize service client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    // 1. Verify caller's session token and identity
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Unauthorized session.' });
    }

    // 2. Authorize the caller (must be owner or admin of this tenant)
    const { data: member, error: memberError } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
      .limit(1);

    if (memberError || !member || member.length === 0 || !['owner', 'admin'].includes(member[0].role)) {
      return res.status(403).json({ error: 'Forbidden: You do not have permissions to create member accounts.' });
    }

    // 3. Create auth user with service role client immediately
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: full_name,
        needs_password_reset: false
      }
    });

    if (authError) {
      console.error('Auth User Creation Error:', authError);
      return res.status(400).json({ error: `Auth Error: ${authError.message}` });
    }

    const newUserId = authData.user.id;

    // 4. Create tenant member record
    const { error: tmError } = await supabase.from('tenant_members').insert({
      tenant_id: tenant_id,
      user_id: newUserId,
      role: role ? role : null,
      user_email: email.toLowerCase().trim(),
      full_name: full_name
    });

    if (tmError) {
      console.error('Tenant Member Insert Error:', tmError);
      // Rollback auth user
      await supabase.auth.admin.deleteUser(newUserId);
      return res.status(500).json({ error: `Database Error (tenant_members): ${tmError.message}` });
    }

    // 5. Update or link the existing employee record
    const { data: existingEmp, error: empFetchErr } = await supabase
      .from('employees')
      .select('id')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();

    if (!empFetchErr && existingEmp) {
      // Update existing employee ID to match the auth user ID
      const { error: empUpdateErr } = await supabase
        .from('employees')
        .update({ id: newUserId })
        .eq('id', existingEmp.id);

      if (empUpdateErr) {
        console.error('Failed to link existing employee ID, trying insert fallback:', empUpdateErr);
      }
    } else {
      // Insert new employee record if it doesn't exist (fallback)
      const parts = full_name.trim().split(/\s+/);
      const lastName = parts.pop() || '';
      const firstName = parts.join(' ') || '';

      // Generate employee number
      let empNum = '';
      try {
        const { data } = await supabase.rpc('generate_employee_number');
        if (data) empNum = data;
      } catch (seqErr) {
        console.warn('RPC generate_employee_number failed during auto-registration fallback');
      }

      if (!empNum) {
        const { count } = await supabase.from('employees').select('*', { count: 'exact', head: true });
        empNum = 'BK-' + String((count || 0) + 1).padStart(4, '0');
      }

      await supabase.from('employees').insert({
        id: newUserId,
        email: email.toLowerCase().trim(),
        first_name: firstName || 'N/A',
        last_name: lastName || 'N/A',
        employee_number: empNum,
        company_id: company_id,
        employment_status: 'Active',
        date_of_birth: '1970-01-01',
        address: 'N/A',
        contact_number: 'N/A',
        emergency_contact_number: 'N/A'
      });
    }

    // 6. Delete any pending invitations
    await supabase.from('company_invitations')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('email', email.toLowerCase().trim());

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Create employee account handler crash:', err);
    return res.status(500).json({ error: `Server crash: ${err.message}` });
  }
}
