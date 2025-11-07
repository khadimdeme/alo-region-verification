import { createClient } from '@supabase/supabase-js';
import argon2 from 'argon2';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// --- CORS helper ---
const allowed = (process.env.CORS_ALLOWED_ORIGINS || 'https://www.aloregion.com,https://aloregion.com').split(',');
function setCORS(req, res) {
  const origin = req.headers.origin;
  if (origin && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCORS(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ error: 'email & code required' });

    // OTP valides récents
    const { data: rows, error } = await supabase
      .from('email_otps')
      .select('*')
      .eq('email', email)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(3);

    if (error) return res.status(500).json({ error: 'query failed' });
    if (!rows?.length) return res.status(400).json({ error: 'Code expiré ou invalide' });

    // comparer hash
    let matchedId = null;
    for (const row of rows) {
      if (await argon2.verify(row.code_hash, code)) { matchedId = row.id; break; }
    }
    if (!matchedId) return res.status(400).json({ error: 'Code invalide' });

    // marquer utilisé
    await supabase.from('email_otps').update({ used_at: new Date().toISOString() }).eq('id', matchedId);

    // s’assurer que l’utilisateur existe
    const { data: byEmail } = await supabase.auth.admin.getUserByEmail(email);
    let user = byEmail?.user;
    if (!user) {
      const pwd = cryptoRandom(32);
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email,
        password: pwd,
        email_confirm: true,
      });
      if (cErr) return res.status(500).json({ error: 'create user failed' });
      user = created.user;
    }

    // générer un action link admin (aucun email envoyé)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr) return res.status(500).json({ error: 'generate link failed' });

    // Flutter (Web) fera: supabase.auth.getSessionFromUrl(action_link)
    return res.json({ ok: true, action_link: linkData?.action_link });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
}

function cryptoRandom(len) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
