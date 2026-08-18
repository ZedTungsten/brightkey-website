import { createPublicClient, createServiceClient, setApiCors } from '../lib/api/security.js';
import { enforceRateLimit } from '../lib/api/rate-limit.js';

const normalizeUsername = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const normalizePhone = value => String(value || '').replace(/[^0-9]/g, '');
export { normalizePhone, normalizeUsername };

async function signIn(publicClient, accountId, password) {
  return publicClient.auth.signInWithPassword({
    email: `customer-${accountId}@portal.brightkeysolutions.com`,
    password
  });
}

export default async function handler(req, res) {
  setApiCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const username = normalizeUsername(req.body?.username);
  const password = normalizePhone(req.body?.password);
  if (!username || password.length < 7 || password.length > 15) {
    return res.status(400).json({ error: 'Enter your username and registered phone number.' });
  }

  try {
    const admin = createServiceClient();
    if (!await enforceRateLimit({
      supabase: admin,
      req,
      res,
      scope: 'customer-portal-login',
      identifier: username,
      limit: 8,
      windowSeconds: 900
    })) return;

    const { data: matches, error: lookupError } = await admin
      .from('customer_portal_accounts')
      .select('id,company_id,auth_user_id,customer_first_name,customer_last_name')
      .eq('username', username)
      .eq('phone_normalized', password)
      .limit(2);
    if (lookupError) throw lookupError;
    if (!matches || matches.length !== 1) {
      return res.status(401).json({ error: 'The username or phone number is incorrect.' });
    }

    const account = matches[0];
    const publicClient = createPublicClient();
    if (!account.auth_user_id) {
      const fullName = [account.customer_first_name, account.customer_last_name].filter(Boolean).join(' ') || username;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: `customer-${account.id}@portal.brightkeysolutions.com`,
        password,
        email_confirm: true,
        app_metadata: { portal_role: 'customer', customer_account_id: account.id, company_id: account.company_id },
        user_metadata: { full_name: fullName }
      });
      if (createError || !created?.user) {
        console.error('Customer portal Auth provisioning failed:', createError);
        return res.status(503).json({ error: 'Your portal account could not be prepared. Please try again shortly.' });
      }
      const { data: linked, error: linkError } = await admin
        .from('customer_portal_accounts')
        .update({ auth_user_id: created.user.id, updated_at: new Date().toISOString() })
        .eq('id', account.id)
        .is('auth_user_id', null)
        .select('id')
        .maybeSingle();
      if (linkError || !linked) {
        await admin.auth.admin.deleteUser(created.user.id);
        console.error('Customer portal Auth link failed:', linkError);
        return res.status(503).json({ error: 'Your portal account could not be linked. Please try again shortly.' });
      }
    }

    const { data: sessionData, error: signInError } = await signIn(publicClient, account.id, password);
    if (signInError || !sessionData?.session) {
      console.error('Customer portal sign-in failed:', signInError);
      return res.status(401).json({ error: 'The username or phone number is incorrect.' });
    }
    return res.status(200).json({
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_at: sessionData.session.expires_at
    });
  } catch (error) {
    console.error('Customer portal login failed:', error);
    return res.status(503).json({ error: 'Customer login is temporarily unavailable. Please try again.' });
  }
}
