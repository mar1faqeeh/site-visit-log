// POST /api/users  { action: "create"|"update"|"password"|"delete", ... }
// All actions run with the Supabase service role key. Caller must be an admin.
// Vercel env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const url = process.env.SUPABASE_URL, service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return res.status(500).json({ error: 'Server is not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: caller, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !caller?.user) return res.status(401).json({ error: 'Invalid session' });
  const { data: profile } = await admin.from('profiles').select('role').eq('id', caller.user.id).maybeSingle();
  if (!profile || profile.role !== 'admin') return res.status(403).json({ error: 'Admins only' });

  const b = req.body || {};
  const role = b.role === 'admin' ? 'admin' : 'tech';

  try {
    if (b.action === 'create') {
      if (!b.email || !b.password) return res.status(400).json({ error: 'Email and password are required' });
      const { data, error } = await admin.auth.admin.createUser({
        email: b.email, password: b.password, email_confirm: true,
        user_metadata: { full_name: b.full_name || b.email, role }
      });
      if (error) throw error;
      await admin.from('profiles').upsert({ id: data.user.id, full_name: b.full_name || b.email, role });
      return res.json({ ok: true, id: data.user.id });
    }
    if (!b.id) return res.status(400).json({ error: 'User id is required' });
    if (b.action === 'update') {
      const patch = {}; if (b.full_name) patch.full_name = b.full_name; if (b.role) patch.role = role;
      const { error } = await admin.from('profiles').update(patch).eq('id', b.id);
      if (error) throw error;
      return res.json({ ok: true });
    }
    if (b.action === 'password') {
      if (!b.password || b.password.length < 6) return res.status(400).json({ error: 'Password too short (min 6)' });
      const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.password });
      if (error) throw error;
      return res.json({ ok: true });
    }
    if (b.action === 'delete') {
      if (b.id === caller.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });
      const { error } = await admin.auth.admin.deleteUser(b.id);
      if (error) throw error;
      await admin.from('profiles').delete().eq('id', b.id);
      return res.json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    return res.status(400).json({ error: e.message || 'Failed' });
  }
}
