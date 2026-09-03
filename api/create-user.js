// POST /api/create-user   { email, password, full_name, role }
// Creates a user with the Supabase service role key. Caller must be an admin.
// Vercel env vars needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return res.status(500).json({ error: 'Server is not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // 1) who is calling?
  const { data: caller, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !caller?.user) return res.status(401).json({ error: 'Invalid session' });

  // 2) are they an admin?
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', caller.user.id).maybeSingle();
  if (!profile || profile.role !== 'admin') return res.status(403).json({ error: 'Admins only' });

  // 3) create the account
  const { email, password, full_name, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || email, role: role === 'admin' ? 'admin' : 'tech' }
  });
  if (error) return res.status(400).json({ error: error.message });

  await admin.from('profiles')
    .upsert({ id: data.user.id, full_name: full_name || email, role: role === 'admin' ? 'admin' : 'tech' });

  return res.status(200).json({ ok: true, id: data.user.id });
}
