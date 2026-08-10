import { createHash, randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { createServiceClient, requireCompanyAccess, sendAccessError, setApiCors, writeSecurityAudit } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';
import { buildEmailBranding } from '../lib/api/email-branding.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function accessLabels(role) {
  if (role === 'admin') return ['Administrator — all modules'];
  if (!String(role || '').startsWith('access:')) return [];
  const tokens = [...new Set(String(role).slice(7).split(',').map(value => value.trim()).filter(Boolean))];
  const scopedParents = new Set(tokens.filter(value => value.includes(':')).map(value => value.split(':')[0]));
  return tokens.filter(value => value.includes(':') || !scopedParents.has(value))
    .map(value => value.includes(':') ? value.replace(':', ' — ') : value);
}

export function buildInvitationEmail({ fullName, role, inviteLink, branding }) {
  const companyName = branding.companyName || 'BrightKey';
  const labels = accessLabels(role);
  const accessText = labels.length ? ` as ${labels.join(', ')}` : '';
  const subject = `Invitation to Join ${companyName} Workspace`.slice(0, 100);
  const html = `
    <div style="font-family:sans-serif;padding:24px;color:#374151;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;background-color:#ffffff;">
      <h2 style="color:#0891b2;font-weight:bold;margin-bottom:20px;text-align:center;">Join ${escapeHtml(companyName)}</h2>
      <p>Hello ${escapeHtml(fullName)},</p>
      <p>You have been invited to join the ${escapeHtml(companyName)} workspace${escapeHtml(accessText)}. Please note that this secure invitation link will expire in 3 days (72 hours).</p>
      <p style="margin-top:24px;text-align:center;">
        <a href="${escapeHtml(inviteLink)}" style="background-color:#06b6d4;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;display:inline-block;">Accept Invitation &amp; Set Up Account</a>
      </p>
      <p style="font-size:13px;color:#9ca3af;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">If you didn't expect this invitation, please ignore this email.</p>
    </div>`;
  return { subject, html };
}

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

  try {
    const supabase = createServiceClient();
    if (!await enforceRateLimit({
      supabase, req, res, scope: 'send-invitation', identifier: company_id, limit: 30, windowSeconds: 3600
    })) return;

    // 1. Verify user's session token and identity
    const access = await requireCompanyAccess(req, supabase, company_id, { roles: ['owner', 'admin'], modules: ['HR', 'HR:Directory'] });
    if (access.error) return sendAccessError(res, access);
    if (access.company.tenant_id !== tenant_id) {
      return res.status(403).json({ error: 'The selected company does not belong to this tenant.' });
    }
    const actorRole = String(access.member.role || '').toLowerCase();
    const actorIsAdmin = actorRole === 'owner' || actorRole === 'admin';
    if (!actorIsAdmin && !(invite_type === 'full' && role === 'employee')) {
      return res.status(403).json({ error: 'You do not have permission to create this type of invitation.' });
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
      console.error('Invitation insert failed:', inviteError);
      return res.status(500).json({ error: 'The invitation could not be saved. Try again shortly.' });
    }

    // 5. Construct invite URL
    let origin = req.headers.referer ? new URL(req.headers.referer).origin : 'https://www.brightkeysolutions.com';
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      origin = 'https://www.brightkeysolutions.com';
    }
    const pagePath = invite_type === 'directory'
      ? 'employee-directory-registration.html'
      : invite_type === 'account'
        ? 'account-registration'
        : 'employee-registration';
    const inviteLink = `${origin}/${pagePath}?tenant=${encodeURIComponent(tenant_id)}&company=${encodeURIComponent(company_id)}&role=${encodeURIComponent(role || '')}&email=${encodeURIComponent(normalizedEmail)}&sig=${encodeURIComponent(inviteToken)}`;

    // 6. Fetch company-specific Resend / SMTP credentials if they exist
    const [integrationResult, profileResult] = await Promise.all([
      supabase.from('company_integrations')
        .select('hr_sender_name, hr_resend_api_key, hr_resend_from_email, hr_smtp_host, hr_smtp_port, hr_smtp_user, hr_smtp_pass, resend_api_key, resend_from_email, smtp_host, smtp_port, smtp_user, smtp_pass')
        .eq('company_id', company_id).maybeSingle(),
      supabase.from('global_settings').select('value')
        .eq('company_id', company_id).eq('key', 'company_profile_config').maybeSingle()
    ]);
    if (integrationResult.error || profileResult.error) {
      return res.status(503).json({ error: 'The company invitation settings could not be loaded. Try again shortly.' });
    }
    const integration = integrationResult.data;
    // Account invitations should remain attachment-free for better mailbox
    // placement. Hosted HTTPS logos still render; data-URL logos use the
    // company-name fallback instead of becoming MIME attachments.
    const branding = buildEmailBranding(profileResult.data?.value || {}, { allowAttachments: false });
    const invitationEmail = buildInvitationEmail({ fullName: full_name, role, inviteLink, branding });

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
          subject: invitationEmail.subject,
          html: invitationEmail.html
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
              subject: invitationEmail.subject,
              html: invitationEmail.html
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

    await writeSecurityAudit(supabase, {
      companyId: company_id,
      actorUserId: access.user.id,
      action: 'employee_invitation_created',
      targetType: 'email',
      targetId: normalizedEmail,
      metadata: { tenant_id, role: role || null, email_sent: emailSent }
    });
    return res.status(200).json({ success: true, email_sent: emailSent, fallback_link: inviteLink });

  } catch (err) {
    console.error('Invitation handler crash:', err);
    return res.status(500).json({ error: 'The invitation service is temporarily unavailable. Check the server configuration and try again.' });
  }
}
