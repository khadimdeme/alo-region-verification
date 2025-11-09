import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Config
const ORIGINS    = (process.env.ALLOWED_ORIGIN || 'https://www.aloregion.com').split(',').map(s => s.trim());
const OTP_SECRET = process.env.OTP_SECRET || 'change-me';

// CORS
function setCors(req, res) {
  const origin = req.headers.origin;
  const allow  = ORIGINS.includes(origin) ? origin : ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Hash + comparaison constante
function hash(code, email) {
  return createHmac('sha256', OTP_SECRET)
    .update(`${email.toLowerCase()}:${code}`)
    .digest('hex');
}
function safeEqualHex(aHex, bHex) {
  const A = Buffer.from(aHex, 'hex');
  const B = Buffer.from(bHex, 'hex');
  return A.length === B.length && timingSafeEqual(A, B);
}
function randomPwd(len = 32) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCors(req, res); return res.status(204).end(); }
  if (req.method !== 'POST')    { setCors(req, res); return res.status(405).json({ error: 'Method not allowed' }); }
  setCors(req, res);

  try {
    const { email, code } = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
    if (!email || !code) return res.status(400).json({ error: 'email & code required' });

    // Récupérer quelques OTP valides récents
    const { data: rows, error } = await supabase
      .from('email_otps')
      .select('id, code_hash')
      .eq('email', email)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) return res.status(500).json({ error: 'query failed' });
    if (!rows?.length) return res.status(400).json({ error: 'Code expiré ou invalide' });

    const expected = hash(code, email);
    let matchedId = null;
    for (const row of rows) {
      if (safeEqualHex(row.code_hash, expected)) { matchedId = row.id; break; }
    }
    if (!matchedId) return res.status(400).json({ error: 'Code invalide' });

    // Marquer utilisé
    await supabase.from('email_otps').update({ used_at: new Date().toISOString() }).eq('id', matchedId);

    // Garantir l’existence de l’utilisateur
    const { data: byEmail } = await supabase.auth.admin.getUserByEmail(email);
    let user = byEmail?.user;
    if (!user) {
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email, password: randomPwd(), email_confirm: true
      });
      if (cErr) return res.status(500).json({ error: 'create user failed' });
      user = created.user;
    }

    // Générer un lien d’action (aucun e-mail envoyé)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email
    });
    if (linkErr) return res.status(500).json({ error: 'generate link failed' });

    // Le front Flutter Web fera: auth.getSessionFromUrl(Uri.parse(action_link))
    return res.json({ ok: true, action_link: linkData?.action_link });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
}
