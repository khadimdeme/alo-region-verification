// api/send-otp.js
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

/* ---------- ENV ---------- */
const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TTL_MIN = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
const OTP_SECRET = process.env.OTP_SECRET || 'change-me';
const APP_NAME = process.env.APP_NAME || 'Alo Region';
const FROM = process.env.OTP_FROM || `Alo Region <contact@aloregion.com>`;
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
function getBody(req) {
  // Vercel peut donner req.body déjà parsé ou en string
  if (!req.body) return {};
  return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
}

/* ---------- Handler ---------- */
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCors(req, res); return res.status(204).end(); }
  setCors(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, purpose = 'login' } = getBody(req);
    if (!email) return res.status(400).json({ error: 'email required' });

    // anti-abus : 1 OTP / 60s par email
    const { data: last } = await supabase
      .from('email_otps')
      .select('created_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last) {
      const delta = (Date.now() - new Date(last.created_at).getTime()) / 1000;
      if (delta < 60) return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques secondes.' });
    }

    // code 6 chiffres + hash
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = hash(code, email);
    const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000).toISOString();

    // stocker
    const { error: insErr } = await supabase.from('email_otps').insert({
      email, code_hash: codeHash, purpose, expires_at: expiresAt
    });
    if (insErr) return res.status(500).json({ error: 'insert failed' });

    // envoyer e-mail
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: `${APP_NAME} — Code de vérification`,
      text: `Votre code : ${code}\nValable ${TTL_MIN} minute(s).`,
      html: `
        <div style="font-family:system-ui,Segoe UI,Arial;padding:24px">
          <h2 style="margin:0 0 12px">${APP_NAME}</h2>
          <p>Voici votre code de vérification :</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:2px">${code}</p>
          <p>Valable ${TTL_MIN} minute(s).</p>
        </div>`
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('send-otp error:', e);
    return res.status(500).json({ error: 'server error' });
  }
}
