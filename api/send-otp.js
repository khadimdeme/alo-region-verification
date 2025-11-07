import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import argon2 from 'argon2';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TTL_MIN = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);

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
    const { email, purpose = 'login' } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email required' });

    // anti-abus: 1 OTP / 60s / email
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

    // code 6 chiffres (hashé en base)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = await argon2.hash(code);
    const expiresAt = new Date(Date.now() + TTL_MIN * 60 * 1000).toISOString();

    const { error: insErr } = await supabase.from('email_otps').insert({
      email, code_hash: codeHash, purpose, expires_at: expiresAt
    });
    if (insErr) return res.status(500).json({ error: 'insert failed' });

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
