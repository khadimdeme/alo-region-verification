import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const TTL_MIN = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
const ORIGIN = process.env.ALLOWED_ORIGIN || 'https://www.aloregion.com';
const OTP_SECRET = process.env.OTP_SECRET || 'change-me';

// HMAC-SHA256(email:code)
function hash(code, email) {
  return createHmac('sha256', OTP_SECRET).update(`${email.toLowerCase()}:${code}`).digest('hex');
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCors(res); return res.status(204).end(); }
  setCors(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, purpose = 'login' } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });

    // anti-abus: 1 OTP / 60s
    const { data: last } = await supabase
      .from('email_otps')
      .select('created_at')
      .eq('email', email).order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (last) {
      const delta = (Date.now() - new Date(last.created_at).getTime()) / 1000;
      if (delta < 60) return res.status(429).json({ error: 'Trop de demandes, réessayez dans quelques secondes.' });
    }

    // code 6 chiffres + hash
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = hash(code, email);
    const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000).toISOString();

    // store
    const { error: insErr } = await supabase.from('email_otps').insert({
      email, code_hash: codeHash, purpose, expires_at: expiresAt
    });
    if (insErr) return res.status(500).json({ error: 'insert failed' });

    // send email
    await resend.emails.send({
      from: process.env.OTP_FROM || `Alo Region <contact@aloregion.com>`,
      to: email,
      subject: `${process.env.APP_NAME || 'Alo Region'} — Code de vérification`,
      html: `
        <div style="font-family:system-ui,Segoe UI,Arial;padding:24px">
          <h2 style="margin:0 0 12px">${process.env.APP_NAME || 'Alo Region'}</h2>
          <p>Voici votre code de vérification :</p>
          <p style="font-size:28px;font-weight:700;letter-spacing:2px">${code}</p>
          <p>Valable ${TTL_MIN} minutes.</p>
        </div>`
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'server error' });
  }
}
