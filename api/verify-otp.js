import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const OTP_SECRET = process.env.OTP_SECRET || 'change-me';

const allowList = (process.env.ALLOWED_ORIGIN || 'https://aloregion.com,https://www.aloregion.com')
  .split(',').map(s => s.trim()).filter(Boolean);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowList.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function hash(code, email) {
  return createHmac('sha256', OTP_SECRET)
    .update(`${email.toLowerCase()}:${code}`)
    .digest('hex');
}
function safeEqualHex(a, b) {
  const A = Buffer.from(a, 'hex');
  const B = Buffer.from(b, 'hex');
  return A.length === B.length && timingSafeEqual(A, B);
}
function randomPwd(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, code } = req.body || {};
    if (!email || !code) return res.status(400).json({ error: 'email & code required' });

    // OTP valides et récents
    const { data: rows, error } = await supabase
      .from('email_otps')
      .select('id, code_hash')
      .eq('email', email)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) return res.status(500).json({ error: 'query failed' });

    const expected = hash(code, email);
    const row = rows?.find(r => safeEqualHex(r.code_hash, expected));
    if (!row) return res.status(400).json({ error: 'Code invalide' });

    await supabase.from('email_otps').update({ used_at: new Date().toISOString() }).eq('id', row.id);

    // garantir l’utilisateur
    const { data: byEmail } = await supabase.auth.admin.getUserByEmail(email);
    let user = byEmail?.user;
    if (!user) {
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email, password: randomPwd(), email_confirm: true
      });
      if (cErr) return res.status(500).json({ error: 'create user failed' });
      user = created.user;
    }

    // créer un action_link (aucun mail envoyé)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink', email
    });
    if (linkErr) return res.status(500).json({ error: 'generate link failed' });

    return res.json({ ok: true, action_link: linkData?.action_link });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
}
