// api/verify-otp.js
import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

/* ---------- ENV ---------- */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const OTP_SECRET = process.env.OTP_SECRET || 'change-me';
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

/* ---------- CORS ---------- */
function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/* ---------- Utils ---------- */
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
function randomPwd() {
  // mot de passe aléatoire (compatible exigences supabase)
  return randomBytes(24).toString('base64url'); // ~32 caractères
}
function getBody(req) {
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

/* ---------- Handler ---------- */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCors(req, res); return res.status(204).end(); }
  setCors(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, code } = getBody(req);
    if (!email || !code) return res.status(400).json({ error: 'email & code required' });

    // 1) récupérer quelques OTP récents non utilisés
    const { data: rows, error } = await supabase
      .from('email_otps')
      .select('id, code_hash')
      .eq('email', email)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(5);

    if (error)       return res.status(500).json({ error: 'query failed' });
    if (!rows?.length) return res.status(400).json({ error: 'Code expiré ou invalide' });

    // 2) comparer HMAC
    const expected = hash(code, email);
    let matchedId = null;
    for (const row of rows) {
      if (safeEqualHex(row.code_hash, expected)) { matchedId = row.id; break; }
    }
    if (!matchedId) return res.status(400).json({ error: 'Code invalide' });

    // 3) marquer l’OTP utilisé
    await supabase.from('email_otps')
      .update({ used_at: new Date().toISOString() })
      .eq('id', matchedId);

    // 4) s’assurer que l’utilisateur existe
    const { data: byEmail } = await supabase.auth.admin.getUserByEmail(email);
    let user = byEmail?.user;
    if (!user) {
      const { data: created, error: cErr } = await supabase.auth.admin.createUser({
        email,
        password: randomPwd(),
        email_confirm: true,
      });
      if (cErr) return res.status(500).json({ error: 'create user failed' });
      user = created.user;
    }

    // 5) générer un lien d’action (aucun e-mail envoyé)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkErr) return res.status(500).json({ error: 'generate link failed' });

    // 6) renvoyer au client Flutter Web → supabase.auth.getSessionFromUrl(action_link)
    return res.json({ ok: true, action_link: linkData?.action_link });
  } catch (e) {
    console.error('verify-otp error:', e);
    return res.status(500).json({ error: 'server error' });
  }
}
