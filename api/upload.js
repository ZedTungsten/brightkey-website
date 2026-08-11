import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { enforceRateLimit } from '../lib/api/rate-limit.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ymjlosnxuhsybkzkoofq.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltamxvc254dWhzeWJremtvb2ZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0MDY1MzYsImV4cCI6MjA4OTk4MjUzNn0.srhk9SVvFuZRcfeRGbVDGPr5pYrFhs8vzcOiMK3A91w';

export default async function handler(req, res) {
  // Allow requests from localhost and production
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { fileBase64, fileName, category, refId, type, companyId, invitation } = req.body;
    const authorization = req.headers.authorization || '';
    const accessToken = authorization.replace(/^Bearer\s+/i, '').trim();
    let invitationAuthorized = false;
    let userData = null;
    let supabase;

    if (accessToken) {
      // Dashboard uploads use the signed-in user's token so tenant-scoped
      // Storage RLS validates the company path.
      supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
        auth: { persistSession: false, autoRefreshToken: false }
      });
      const { data, error: userError } = await supabase.auth.getUser(accessToken);
      userData = data;
      if (userError || !userData?.user) {
        return res.status(401).json({ error: 'Your session has expired. Sign in again before uploading.' });
      }
    } else if (category === 'employees' && invitation) {
      if (!['profile', 'gov-id', 'cv', 'payout'].includes(type)) {
        return res.status(400).json({ error: 'This file type is not supported by employee registration.' });
      }
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
      const tenantId = String(invitation.tenantId || '').trim();
      const inviteEmail = String(invitation.email || '').toLowerCase().trim();
      const inviteSignature = String(invitation.signature || '').trim();
      if (!serviceRoleKey || !tenantId || !inviteEmail || !inviteSignature || !companyId) {
        return res.status(401).json({ error: 'This registration link could not authorize the upload. Reopen the link or ask for a new invitation.' });
      }

      supabase = createClient(SUPABASE_URL, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });
      if (!await enforceRateLimit({
        supabase,
        req,
        res,
        scope: 'employee-registration-upload',
        identifier: inviteEmail,
        limit: 30,
        windowSeconds: 3600
      })) return;

      const tokenHash = createHash('sha256').update(inviteSignature).digest('hex');
      const { data: invite, error: inviteError } = await supabase
        .from('company_invitations')
        .select('role, expires_at, used_at')
        .eq('tenant_id', tenantId)
        .eq('company_id', companyId)
        .eq('email', inviteEmail)
        .eq('token_hash', tokenHash)
        .maybeSingle();
      if (inviteError || !invite || invite.role !== 'employee' || invite.used_at || !invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) {
        return res.status(401).json({ error: 'This registration link is invalid or expired. Ask your administrator for a new invitation.' });
      }
      invitationAuthorized = true;
    } else {
      return res.status(401).json({ error: 'Your session has expired. Sign in again before uploading.' });
    }

    if (!fileBase64 || !fileName) {
      return res.status(400).json({ error: 'Missing fileBase64 or fileName.' });
    }

    // Clean up base64 prefix and extract content type
    const hasPrefix = fileBase64.includes(';base64,');
    let contentType = 'application/octet-stream';
    if (hasPrefix) {
      const match = fileBase64.match(/^data:(.*?);base64,/);
      if (match) contentType = match[1];
    }
    const base64Data = hasPrefix ? fileBase64.split(';base64,').pop() : fileBase64;
    const buffer = Buffer.from(base64Data, 'base64');

    if (!companyId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)) {
      return res.status(400).json({ error: 'A valid company is required before uploading a file.' });
    }

    // Match upload access to the same modules that gate each dashboard page.
    // Owners/admins pass through has_module_access; regular members pass when
    // any assigned accessible_modules entry matches one of these modules.
    let allowedModules = [];
    if (category === 'products') {
      allowedModules = refId === 'qa_guides' ? ['Logistics'] : ['Products'];
    } else if (category === 'installations') {
      allowedModules = ['Operations', 'Logistics'];
    } else if (category === 'employees') {
      allowedModules = ['HR'];
    } else if (category === 'logos') {
      allowedModules = ['Operations'];
    }

    if (allowedModules.length > 0 && !invitationAuthorized) {
      const accessChecks = await Promise.all(allowedModules.map(moduleName => (
        supabase.rpc('has_module_access', {
          p_user_id: userData.user.id,
          p_company_id: companyId,
          p_module: moduleName
        })
      )));
      const accessError = accessChecks.find(result => result.error)?.error;
      if (accessError) {
        console.error('Upload module access check failed:', accessError);
        return res.status(503).json({ error: 'Upload access could not be verified. Please try again.' });
      }
      if (!accessChecks.some(result => result.data === true)) {
        return res.status(403).json({ error: 'Access to this module is required before uploading files here.' });
      }
    }

    const { data: quotaRows, error: quotaError } = await supabase
      .rpc('check_company_storage_quota', {
        p_company_id: companyId,
        p_incoming_bytes: buffer.length
      });
    if (quotaError) {
      console.error('Storage quota check failed:', quotaError);
      return res.status(503).json({ error: 'Storage availability could not be verified. Please try the upload again.' });
    }
    if (!quotaRows?.[0]?.allowed) {
      return res.status(413).json({
        error: 'This company has reached its storage limit. Remove files or increase the tenant storage allocation before uploading.'
      });
    }

    // Clean file name to prevent directory traversal
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const safeRefId = (refId || 'general').replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const safeCompanyId = companyId;

    // Organize folder layout dynamically based on categorizations (scoped per company)
    let folderPath = '';
    const prefix = `companies/${safeCompanyId}`;
    if (category === 'products') {
      folderPath = `${prefix}/products/${safeRefId}`;
    } else if (category === 'installations') {
      if (type === 'site') {
        folderPath = `${prefix}/installations/${safeRefId}/site`;
      } else if (type === 'doors') {
        folderPath = `${prefix}/installations/${safeRefId}/doors`;
      } else if (type === 'proof') {
        folderPath = `${prefix}/installations/${safeRefId}/proof`;
      } else if (type === 'receipt') {
        folderPath = `${prefix}/installations/${safeRefId}/receipt`;
      } else {
        folderPath = `${prefix}/installations/${safeRefId}`;
      }
    } else if (category === 'employees') {
      if (type === 'photo' || type === 'profile') {
        folderPath = `${prefix}/employees/${safeRefId}/photo`;
      } else if (type === 'govid' || type === 'gov-id') {
        folderPath = `${prefix}/employees/${safeRefId}/govid`;
      } else if (type === 'cv') {
        folderPath = `${prefix}/employees/${safeRefId}/cv`;
      } else if (type === 'payout' || type === 'qr') {
        folderPath = `${prefix}/employees/${safeRefId}/payout`;
      } else if (type === 'id') {
        folderPath = `${prefix}/employees/${safeRefId}/id`;
      } else {
        folderPath = `${prefix}/employees/${safeRefId}`;
      }
    } else if (category === 'logos') {
      folderPath = `${prefix}/logos`;
    } else {
      folderPath = `${prefix}/uploads/general`;
    }

    // Sensitive employee documents go to the private bucket; everything else stays public
    const SENSITIVE_TYPES = ['govid', 'gov-id', 'cv', 'id', 'payout', 'qr'];
    const isInternal = category === 'employees' && SENSITIVE_TYPES.includes(type);
    const bucketName = isInternal ? 'brightkey-internal' : 'brightkey-assets';
    // A unique name keeps uploads on the INSERT policy path. Replacing an
    // existing Storage object would require a broader UPDATE policy.
    const filePath = `${folderPath}/${Date.now()}_${safeFileName}`;

    // Upload buffer directly to Supabase storage bucket
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, buffer, {
        contentType: contentType,
        upsert: false
      });

    if (error) {
      throw error;
    }

    // For private (internal) files: return a long-lived signed URL (10 years).
    // For public files: return a direct public URL.
    let fileUrl;
    if (isInternal) {
      const TEN_YEARS_SECONDS = 315360000;
      const { data: signedData, error: signErr } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, TEN_YEARS_SECONDS);
      if (signErr) throw signErr;
      fileUrl = signedData.signedUrl;
    } else {
      fileUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${filePath}`;
    }

    return res.status(200).json({
      success: true,
      url: fileUrl,
      path: filePath,
      bucket: bucketName
    });

  } catch (error) {
    console.error('Supabase Storage Upload Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error during upload.' });
  }
}
