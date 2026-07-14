import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import nodemailer from 'nodemailer';

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
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const EMAIL_FROM = process.env.EMAIL_FROM || 'BrightKey Solutions <onboarding@brightkeysolutions.com>';

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase configuration is missing on server.' });
  }

  const { tenant_id, company_id, email, full_name, role, invited_by, invite_type } = req.body;
  if (!tenant_id || !company_id || !email || !full_name) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  // Initialize service client
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    // 1. Verify user's session token and identity
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return res.status(401).json({ error: 'Unauthorized session.' });
    }

    // 2. Authorize the user (must be owner or admin of this tenant)
    const { data: member, error: memberError } = await supabase
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant_id)
      .eq('user_id', user.id)
      .limit(1);

    if (memberError || !member || member.length === 0 || !['owner', 'admin'].includes(member[0].role)) {
      return res.status(403).json({ error: 'Forbidden: You do not have permissions to invite members to this tenant.' });
    }

    // 3. Insert into company_invitations
    const { error: inviteError } = await supabase
      .from('company_invitations')
      .insert({
        tenant_id,
        email: email.toLowerCase().trim(),
        full_name,
        role: role ? role : null,
        invited_by: user.id
      });

    if (inviteError) {
      if (inviteError.code === '23505') {
        return res.status(400).json({ error: 'An invitation for this email already exists in this tenant.' });
      }
      return res.status(500).json({ error: `Invite insertion failed: ${inviteError.message}` });
    }

    // 4. Generate secure signature
    const msg = `${tenant_id}:${company_id}:${role || ''}:${email.toLowerCase().trim()}:brightkey_invite_salt`;
    const signature = createHash('sha256').update(msg).digest('hex');

    // 5. Construct invite URL
    let origin = req.headers.referer ? new URL(req.headers.referer).origin : 'https://www.brightkeysolutions.com';
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      origin = 'https://www.brightkeysolutions.com';
    }
    const pagePath = invite_type === 'directory' ? 'employee-directory-registration.html' : 'employee-registration';
    const inviteLink = `${origin}/${pagePath}?tenant=${encodeURIComponent(tenant_id)}&company=${encodeURIComponent(company_id)}&role=${encodeURIComponent(role || '')}&email=${encodeURIComponent(email.toLowerCase().trim())}&sig=${signature}`;

    // 6. Fetch company-specific Resend / SMTP credentials if they exist
    const { data: integration } = await supabase
      .from('company_integrations')
      .select('hr_resend_api_key, hr_resend_from_email, hr_smtp_host, hr_smtp_port, hr_smtp_user, hr_smtp_pass, resend_api_key, resend_from_email, smtp_host, smtp_port, smtp_user, smtp_pass')
      .eq('company_id', company_id)
      .maybeSingle();

    const activeResendApiKey = integration?.hr_resend_api_key || integration?.resend_api_key || RESEND_API_KEY;
    const activeEmailFrom = integration?.hr_resend_from_email || integration?.resend_from_email || EMAIL_FROM;
    const smtpUser = integration?.hr_smtp_user || integration?.smtp_user;
    const smtpPass = integration?.hr_smtp_pass || integration?.smtp_pass;
    const smtpHost = integration?.hr_smtp_host || integration?.smtp_host || 'smtp.gmail.com';
    const smtpPort = integration?.hr_smtp_port || integration?.smtp_port || 465;

    let emailSent = false;

    if (smtpUser && smtpPass) {
      // Send via SMTP (Gmail)
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(smtpPort) || 465,
          secure: (parseInt(smtpPort) || 465) === 465,
          auth: {
            user: smtpUser,
            pass: smtpPass
          }
        });

        await transporter.sendMail({
          from: `"BrightKey Solutions" <${smtpUser}>`,
          to: email,
          subject: 'Invitation to Join BrightKey Solutions Workspace',
          html: `
            <div style="font-family: sans-serif; padding: 24px; color: #374151; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
              <h2 style="color: #0891b2; font-weight: bold; margin-bottom: 20px; text-align: center;">Join BrightKey Solutions</h2>
              <p>Hello ${full_name},</p>
              <p>You have been invited to join the BrightKey Solutions workspace for your organization${role ? ` as a <strong>${role.replace('_', ' ')}</strong>` : ''}. Please note that this secure invitation link will expire in 3 days (72 hours).</p>
              <p style="margin-top: 24px; text-align: center;">
                <a href="${inviteLink}" style="background-color: #06b6d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  Accept Invitation & Set Up Account
                </a>
              </p>
              <p style="font-size: 13px; color: #9ca3af; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
                If you didn't expect this invitation, please ignore this email.
              </p>
            </div>
          `
        });

        emailSent = true;
      } catch (err) {
        console.error('Failed to dispatch invite email via SMTP:', err);
      }
    } else {
      // Fallback to Resend (either tenant's own or system-wide)
      if (activeResendApiKey) {
        try {
          const mailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${activeResendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: activeEmailFrom,
              to: email,
              subject: 'Invitation to Join BrightKey Solutions Workspace',
              html: `
                <div style="font-family: sans-serif; padding: 24px; color: #374151; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; background-color: #ffffff;">
                  <h2 style="color: #0891b2; font-weight: bold; margin-bottom: 20px; text-align: center;">Join BrightKey Solutions</h2>
                  <p>Hello ${full_name},</p>
                  <p>You have been invited to join the BrightKey Solutions workspace for your organization${role ? ` as a <strong>${role.replace('_', ' ')}</strong>` : ''}. Please note that this secure invitation link will expire in 3 days (72 hours).</p>
                  <p style="margin-top: 24px; text-align: center;">
                    <a href="${inviteLink}" style="background-color: #06b6d4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                      Accept Invitation & Set Up Account
                    </a>
                  </p>
                  <p style="font-size: 13px; color: #9ca3af; margin-top: 32px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
                    If you didn't expect this invitation, please ignore this email.
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
          console.error('Failed to dispatch invite email via Resend:', err);
        }
      } else {
        console.warn('Resend API key not defined. Email dispatch skipped.');
      }
    }

    return res.status(200).json({ success: true, email_sent: emailSent, fallback_link: inviteLink });

  } catch (err) {
    console.error('Invitation handler crash:', err);
    return res.status(500).json({ error: `Server crash: ${err.message}` });
  }
}
