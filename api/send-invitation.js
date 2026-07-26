import { createHash, randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { createServiceClient, requireCompanyAccess, sendAccessError, setApiCors } from '../lib/api/security.js';

export default async function handler(req, res) {
  setApiCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization token' });
  }
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const EMAIL_FROM = process.env.EMAIL_FROM || 'BrightKey Solutions <onboarding@brightkeysolutions.com>';

  const { tenant_id, company_id, email, full_name, role, invited_by, invite_type } = req.body;
  if (!tenant_id || !company_id || !email || !full_name) {
    return res.status(400).json({ error: 'Missing required parameters.' });
  }

  const supabase = createServiceClient();

  try {
    // 1. Verify user's session token and identity
    const access = await requireCompanyAccess(req, supabase, company_id, { roles: ['owner', 'admin'] });
    if (access.error) return sendAccessError(res, access);
    if (access.company.tenant_id !== tenant_id) {
      return res.status(403).json({ error: 'The selected company does not belong to this tenant.' });
    }

    const inviteToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(inviteToken).digest('hex');
    const normalizedEmail = email.toLowerCase().trim();
    const expiresAt = new Date(Date.now() + (72 * 60 * 60 * 1000)).toISOString();

    await supabase
      .from('company_invitations')
      .delete()
      .eq('tenant_id', tenant_id)
      .eq('email', normalizedEmail);

    const { error: inviteError } = await supabase
      .from('company_invitations')
      .insert({
        tenant_id,
        company_id,
        email: normalizedEmail,
        full_name,
        role: role ? role : null,
        invited_by: access.user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
        used_at: null
      });

    if (inviteError) {
      if (inviteError.code === '23505') {
        return res.status(400).json({ error: 'An invitation for this email already exists in this tenant.' });
      }
      return res.status(500).json({ error: `Invite insertion failed: ${inviteError.message}` });
    }

    // 5. Construct invite URL
    let origin = req.headers.referer ? new URL(req.headers.referer).origin : 'https://www.brightkeysolutions.com';
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      origin = 'https://www.brightkeysolutions.com';
    }
    const pagePath = invite_type === 'directory' ? 'employee-directory-registration.html' : 'employee-registration';
    const inviteLink = `${origin}/${pagePath}?tenant=${encodeURIComponent(tenant_id)}&company=${encodeURIComponent(company_id)}&role=${encodeURIComponent(role || '')}&email=${encodeURIComponent(normalizedEmail)}&sig=${encodeURIComponent(inviteToken)}`;

    // 6. Fetch company-specific Resend / SMTP credentials if they exist
    const { data: integration } = await supabase
      .from('company_integrations')
      .select('hr_sender_name, hr_resend_api_key, hr_resend_from_email, hr_smtp_host, hr_smtp_port, hr_smtp_user, hr_smtp_pass, resend_api_key, resend_from_email, smtp_host, smtp_port, smtp_user, smtp_pass')
      .eq('company_id', company_id)
      .maybeSingle();

    const activeResendApiKey = integration?.hr_resend_api_key || integration?.resend_api_key || RESEND_API_KEY;
    const activeEmailFrom = integration?.hr_resend_from_email || integration?.resend_from_email || EMAIL_FROM;
    const smtpUser = integration?.hr_smtp_user || integration?.smtp_user;
    const smtpPass = integration?.hr_smtp_pass || integration?.smtp_pass;
    const smtpHost = integration?.hr_smtp_host || integration?.smtp_host || 'smtp.gmail.com';
    const smtpPort = integration?.hr_smtp_port || integration?.smtp_port || 465;
    const senderName = integration?.hr_sender_name || 'BrightKey Solutions';

    let finalFrom = activeEmailFrom;
    if (finalFrom && !finalFrom.includes('<')) {
      finalFrom = `"${senderName}" <${finalFrom}>`;
    }

    let emailSent = false;
    const isPlaceholder = email.toLowerCase().trim().endsWith('@placeholder.brightkey.com');

    if (isPlaceholder) {
      emailSent = true; // Link only, skip email dispatch
    } else if (smtpUser && smtpPass) {
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

        let finalSmtpFrom = smtpUser;
        if (finalSmtpFrom && !finalSmtpFrom.includes('<')) {
          finalSmtpFrom = `"${senderName}" <${finalSmtpFrom}>`;
        }

        await transporter.sendMail({
          from: finalSmtpFrom,
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
              from: finalFrom,
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
